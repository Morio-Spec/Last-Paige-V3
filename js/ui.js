/* ============================================================
   FICHA LAST PAIGE — js/ui.js
   Renderização, eventos, modais, autocomplete, toasts e atalhos.
   Toda a manipulação da tela mora aqui; nenhum listener global
   solto no index.html.
   ============================================================ */

import * as storage from './storage.js';
import * as dados from './data-loader.js';
import * as temas from './theme.js';
import {
    estado,
    substituirEstado,
    definir,
    obter,
    numero,
    alterado,
    inscrever,
    clonar,
    desfazer,
    salvamento,
    criarEstadoInicial,
    VERSAO as VERSAO_FICHA
} from './state.js';
import * as ficha from './character.js';

/* ============================================================
   Estado da interface (tudo encapsulado — sem globais soltas)
   ============================================================ */
const ui = {
    fichaId: null,          // id da ficha aberta no storage
    bloqueado: true,        // true = somente leitura
    dados: {
        trilhas: [],
        equipamentos: [],
        efeitosDesespero: [],
        efeitosAutomaticos: [],
        condicoes: [],
        pericias: []
    }
};

/* ============================================================
   Utilidades
   ============================================================ */

/** Escapa texto para inserção segura em HTML. */
function esc(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Remove acentos eixa minúscula (para o autocomplete). */
function normalizar(texto) {
    return String(texto ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '');
}

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

function icone(nome) {
    return `<i class="bi bi-${nome}" aria-hidden="true"></i>`;
}

/* ============================================================
   Toasts
   ============================================================ */

const ICONES_TOAST = {
    sucesso: 'check-circle-fill',
    erro: 'exclamation-octagon-fill',
    aviso: 'exclamation-triangle-fill',
    info: 'info-circle-fill'
};

/**
 * Mostra um aviso temporário no canto da tela.
 * @param {string} mensagem
 * @param {'sucesso'|'erro'|'aviso'|'info'} tipo
 */
function toast(mensagem, tipo = 'info', duracao = 3400) {
    const container = $('#toasts');
    if (!container) return;

    const item = document.createElement('div');
    item.className = 'toast toast--' + tipo;
    item.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    item.innerHTML = `${icone(ICONES_TOAST[tipo] || ICONES_TOAST.info)}<span>${esc(mensagem)}</span>`;

    container.appendChild(item);

    setTimeout(() => {
        item.classList.add('is-out');
        setTimeout(() => item.remove(), 320);
    }, duracao);
}

/* ============================================================
   Confirmação (modal)
   ============================================================ */

/* Confirmações são enfileiradas: o mesmo modal não pode ser reaberto
   enquanto ainda está fechando. */
let filaConfirmacao = Promise.resolve(true);

/**
 * Mostra o modal de confirmação.
 * @returns {Promise<boolean>}
 */
function confirmar(opcoes = {}) {
    const executar = () => mostrarConfirmacao(opcoes);
    filaConfirmacao = filaConfirmacao.then(executar, executar);
    return filaConfirmacao;
}

function mostrarConfirmacao({
    titulo = 'Confirmar ação',
    texto = 'Tem certeza?',
    rotuloOk = 'Confirmar',
    perigo = true
} = {}) {
    return new Promise((resolve) => {
        const modalEl = $('#modalConfirmar');
        const botaoOk = $('#btn-confirmar-ok');
        const tituloEl = $('#modalConfirmar-titulo');
        const textoEl = $('#confirmar-texto');
        if (!modalEl || !botaoOk) {
            resolve(window.confirm(texto));
            return;
        }

        tituloEl.textContent = titulo;
        textoEl.textContent = texto;
        botaoOk.textContent = rotuloOk;
        botaoOk.className = 'btn ' + (perigo ? 'btn-danger' : 'btn-accent');

        const instance = bootstrap.Modal.getOrCreateInstance(modalEl);
        let respondido = false;

        const limpar = () => {
            botaoOk.removeEventListener('click', aoConfirmar);
            modalEl.removeEventListener('hidden.bs.modal', aoEsconder);
        };

        // Só resolve quando o modal terminou de sumir: assim a próxima
        // confirmação (ex.: a dupla de "Limpar ficha") consegue abrir.
        const aoEsconder = () => {
            limpar();
            if (!respondido) {
                respondido = true;
                resolve(false);
            } else {
                resolve(true);
            }
        };

        /**
         * Fecha o modal de forma confiável: se ele ainda estiver animando a
         * entrada, o Bootstrap ignora um hide() imediato e o modal trava
         * aberto. Esperamos o 'shown' e mantemos um timeout de segurança.
         */
        const fechar = () => {
            let fechado = false;
            const hide = () => {
                if (fechado) return;
                fechado = true;
                instance.hide();
            };
            modalEl.addEventListener('shown.bs.modal', hide, { once: true });
            setTimeout(hide, 400);
        };

        const aoConfirmar = () => {
            if (respondido) return;
            respondido = true;
            fechar();
        };

        botaoOk.addEventListener('click', aoConfirmar);
        modalEl.addEventListener('hidden.bs.modal', aoEsconder);
        instance.show();
    });
}

/** Confirmação dupla: exige duas confirmações seguidas (ações destrutivas). */
async function confirmarDuplo(texto, titulo = 'Cuidado') {
    const primeira = await confirmar({ titulo, texto, rotuloOk: 'Entendi, quero apagar', perigo: true });
    if (!primeira) return false;
    return confirmar({
        titulo: 'Tem certeza mesmo?',
        texto: 'Esta é a última confirmação. O que for apagado não volta (a não ser que você tenha um JSON exportado).',
        rotuloOk: 'Sim, apagar de verdade',
        perigo: true
    });
}

/* ============================================================
   Feedback de salvamento
   ============================================================ */

function feedback(texto, status = 'salvo') {
    const elemento = $('#save-feedback');
    const textoEl = $('#save-feedback-text');
    if (!elemento || !textoEl) return;
    elemento.dataset.status = status;
    const iconeEl = elemento.querySelector('i');
    if (iconeEl) {
        iconeEl.className = 'bi bi-' + (
            status === 'salvo' ? 'check-circle' :
            status === 'salvando' ? 'arrow-repeat' :
            status === 'erro' ? 'exclamation-triangle' : 'cloud'
        );
    }
    textoEl.textContent = texto;
}

/** Salva a ficha aberta imediatamente. */
function salvarAgora(silencioso = false) {
    if (!ui.fichaId) {
        feedback('nenhuma ficha aberta', 'erro');
        return false;
    }
    salvamento.cancelar();
    const ok = storage.salvarFicha(ui.fichaId, clonar(estado));
    if (ok) {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        feedback(`salvo ✓ ${hora}`, 'salvo');
        if (!silencioso) toast('Ficha salva.', 'sucesso', 1800);
    } else {
        feedback('não consegui salvar (armazenamento cheio?)', 'erro');
        if (!silencioso) toast('Falha ao salvar. O navegador pode ter bloqueado o armazenamento.', 'erro', 5000);
    }
    return ok;
}

/* ============================================================
   Modo Editar / Bloquear (RF03)
   ============================================================ */

function aplicarModoBloqueio() {
    document.body.dataset.lock = ui.bloqueado ? 'true' : 'false';
    document.documentElement.dataset.lock = ui.bloqueado ? 'true' : 'false';

    $$('[contenteditable]').forEach((el) => {
        el.contentEditable = ui.bloqueado ? 'false' : 'true';
    });

    const btnEditar = $('#btn-editar');
    const btnBloquear = $('#btn-bloquear');
    if (btnEditar) {
        btnEditar.classList.toggle('d-none', !ui.bloqueado);
        btnEditar.setAttribute('aria-pressed', String(!ui.bloqueado));
    }
    if (btnBloquear) btnBloquear.classList.toggle('d-none', ui.bloqueado);

    // Ao bloquear, fecha autocomplete e highlights de edição.
    fecharTodosOsAutocompletes();
    $$('.editable--live').forEach((el) => el.classList.remove('editable--live'));
}

function alternarEdicao() {
    ui.bloqueado = !ui.bloqueado;
    aplicarModoBloqueio();
    toast(
        ui.bloqueado ? 'Ficha bloqueada.' : 'Modo de edição liberado.',
        ui.bloqueado ? 'info' : 'sucesso',
        1600
    );
}

/** Fecha um autocomplete: exige destravado. */
function podeEditar() {
    if (ui.bloqueado) {
        toast('Desbloqueie a ficha (Ctrl+E) para editar.', 'aviso', 2200);
        return false;
    }
    return true;
}

/* ============================================================
   Campos editáveis ligados ao estado (data-bind)
   ============================================================ */

const CAMINHOS_NUMERICOS = new Set([
    'nivel',
    'atributos.fisico', 'atributos.agilidade', 'atributos.forca',
    'atributos.carisma', 'atributos.inteligencia', 'atributos.energiaAmaldicoada',
    'recursos.hp.atual', 'recursos.hp.max',
    'recursos.pa.atual', 'recursos.pa.max',
    'recursos.psi.atual', 'recursos.psi.max',
    'insanidade.atual', 'esquiva'
]);

/** Campos que disparam recálculo de HP/PA/Esquiva/DT. */
const CAMINHOS_RECALCULAVEIS = new Set([
    'nivel',
    'atributos.fisico', 'atributos.agilidade', 'atributos.energiaAmaldicoada'
]);

function aoEditarCampo(caminho, texto, elemento) {
    let valor = texto;
    if (CAMINHOS_NUMERICOS.has(caminho)) {
        valor = texto.replace(/[^\d-]/g, '');
    }
    definir(caminho, valor);

    if (CAMINHOS_RECALCULAVEIS.has(caminho)) {
        ficha.aplicarDerivados(estado);
    }
    if (caminho === 'nivel') aoMudarNivel();
    alterado('campo');
    elemento.classList.add('editable--live');
    clearTimeout( elemento._timerLive );
    elemento._timerLive = setTimeout(() => elemento.classList.remove('editable--live'), 700);
}

/**
 * O nível do personagem abre e fecha maldições da trilha.
 * Roda quando o nível muda por qualquer caminho (digitação ou recálculo).
 */
function aoMudarNivel() {
    const trilha = ficha.acharTrilha(ui.dados.trilhas, estado.trilha.nome);
    if (!trilha) {
        renderMaldicoes();
        return;
    }
    const resultado = ficha.sincronizarMaldicoesDaTrilha(estado, trilha);
    renderMaldicoes();
    if (resultado.novas.length) {
        toast(`Nível ${numero(estado.nivel, 1)}: ${resultado.novas.join(', ')}.`, 'sucesso', 4200);
    } else if (resultado.removidas.length) {
        toast(`Nível ${numero(estado.nivel, 1)}: maldição(ões) da trilha acima do nível foram ocultadas.`, 'aviso', 4200);
    }
}

/** Ao sair do campo, mostra o valor normalizado. */
function normalizarCampo(caminho, elemento) {
    if (!CAMINHOS_NUMERICOS.has(caminho)) return;
    const bruto = elemento.textContent.replace(/[^\d-]/g, '');
    const valor = bruto === '' ? (caminho === 'nivel' ? 1 : 0) : numero(bruto, 0);
    definir(caminho, valor);
    elemento.textContent = valor;
    if (CAMINHOS_RECALCULAVEIS.has(caminho)) ficha.aplicarDerivados(estado);
    if (caminho === 'nivel') aoMudarNivel();
    alterado('campo');
}

/** Atualiza os campos da tela a partir do estado (pula o campo em foco). */
function sincronizarCampos() {
    $$('[data-bind]').forEach((el) => {
        if (document.activeElement === el) return;
        const valor = obter(el.dataset.bind);
        const texto = valor == null ? '' : String(valor);
        if (el.textContent !== texto) el.textContent = texto;
    });

    // Itens das listas (equipamentos/maldições) — sem mexer no item em edição.
    $$('[data-lista]').forEach((el) => {
        if (document.activeElement === el) return;

        // Perícias são um dicionário simples (nome -> valor), não uma lista.
        if (el.dataset.lista === 'pericias') {
            const valor = numero(estado.pericias[el.dataset.id], 0);
            const texto = String(valor);
            if (el.textContent !== texto) el.textContent = texto;
            return;
        }

        const item = (estado[el.dataset.lista] || []).find((i) => String(i.id) === String(el.dataset.id));
        if (!item) return;
        const texto = item[el.dataset.prop] == null ? '' : String(item[el.dataset.prop]);
        if (el.textContent !== texto) el.textContent = texto;
    });
}

/* ============================================================
   Recursos: HP / PA / Psiquê (RF04)
   ============================================================ */

const ROTULO_RECURSO = { hp: 'HP', pa: 'PA', psi: 'Psiquê' };

function renderRecursos() {
    ['hp', 'pa', 'psi'].forEach((nome) => {
        const { atual, max } = ficha.recurso(nome);
        const barra = $('#bar-' + nome);
        const preenchimento = barra?.querySelector('.resource__fill');
        if (preenchimento) {
            preenchimento.style.width = Math.max(0, Math.min(100, (atual / max) * 100)) + '%';
        }
        if (barra) {
            barra.setAttribute('aria-valuenow', atual);
            barra.setAttribute('aria-valuemax', max);
            barra.setAttribute('aria-valuemin', 0);
            barra.setAttribute('aria-label', `Ajustar ${ROTULO_RECURSO[nome]}: ${atual} de ${max}`);
        }
    });
}

function atualizarRecurso(nome, delta) {
    const resultado = ficha.ajustarRecurso(nome, delta);
    if (!resultado) return;
    alterado('recurso');
    const recursoEl = $(`[data-res="${nome}"]`);
    recursoEl?.classList.add('is-damage');
    setTimeout(() => recursoEl?.classList.remove('is-damage'), 380);
}

/** Clique/arraste na barra define o valor. */
function ajustarPorBarra(nome, evento) {
    const barra = evento.currentTarget;
    const { max } = ficha.recurso(nome);
    const caixa = barra.getBoundingClientRect();
    const proporcao = Math.max(0, Math.min(1, (evento.clientX - caixa.left) / caixa.width));
    const alvo = Math.round(proporcao * max);
    ficha.definirRecurso(nome, alvo);
    alterado('recurso');
}

/** Teclado nas barras (acessibilidade do slider). */
function ajustarPorTeclado(nome, evento) {
    const passo = evento.shiftKey ? 5 : 1;
    if (evento.key === 'ArrowLeft' || evento.key === 'ArrowDown') {
        evento.preventDefault();
        atualizarRecurso(nome, -passo);
    } else if (evento.key === 'ArrowRight' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        atualizarRecurso(nome, passo);
    } else if (evento.key === 'Home') {
        evento.preventDefault();
        ficha.definirRecurso(nome, 0);
        alterado('recurso');
    } else if (evento.key === 'End') {
        evento.preventDefault();
        ficha.definirRecurso(nome, ficha.recurso(nome).max);
        alterado('recurso');
    }
}

/* ============================================================
   Derivados (Esquiva, DT, Insanidade, última alteração)
   ============================================================ */

function renderDerivados() {
    const d = ficha.calcularDerivados(estado);
    const dt = $('#val-dt');
    if (dt) dt.textContent = d.dt;
    const ultima = $('#ultima-alteracao');
    if (ultima) {
        const ultimo = estado.historico[estado.historico.length - 1];
        ultima.textContent = ultimo ? ultimo.rotulo : '—';
    }
    const desfaziveis = $$('[data-undo]');
    desfaziveis.forEach((botao) => {
        const tipo = botao.dataset.undo;
        const existe = estado.historico.some((h) => h.mudancas.some((m) => m.caminho === `recursos.${tipo}.atual`));
        botao.disabled = !existe;
        botao.title = existe ? 'Desfazer última alteração de ' + ROTULO_RECURSO[tipo] : 'Nada para desfazer';
    });
}

/* ============================================================
   Desespero (RF05)
   ============================================================ */

function construirDesespero() {
    const container = $('#despero-caixas');
    if (!container) return;

    container.innerHTML = '';
    for (let nivel = 1; nivel <= 15; nivel++) {
        const caixa = document.createElement('button');
        caixa.type = 'button';
        caixa.className = 'dbox';
        caixa.dataset.nivel = nivel;
        caixa.setAttribute('aria-label', 'Desespero nível ' + nivel);
        caixa.innerHTML = `<span class="dbox__tip"></span>${nivel}`;
        container.appendChild(caixa);
    }
}

function renderDesespero() {
    const nivel = numero(estado.despero, 0);

    $$('.dbox').forEach((caixa) => {
        const n = numero(caixa.dataset.nivel, 0);
        const preenchida = n <= nivel && nivel > 0;
        const faixa = preenchida ? ficha.faixaDesespero(n) : 0;
        caixa.classList.toggle('is-filled', preenchida);
        caixa.classList.remove('t1', 't2', 't3', 't4');
        if (preenchida) caixa.classList.add('t' + faixa);
        caixa.setAttribute('aria-pressed', String(preenchida));

        const efeito = ui.dados.efeitosDesespero.find((e) => numero(e.nivel, 0) === n);
        const tooltip = caixa.querySelector('.dbox__tip');
        if (tooltip && efeito) {
            tooltip.innerHTML = `<strong>Nível ${n} — ${esc(efeito.nome)}</strong>${esc(textoEfeito(n))}`;
        }
    });

    const contador = $('#despero-nivel');
    if (contador) contador.textContent = nivel;

    renderEfeitoDesespero(nivel);
}

function textoEfeito(nivel) {
    const sobrescrito = estado.desesperoOverrides?.[nivel];
    if (sobrescrito) return sobrescrito;
    const efeito = ui.dados.efeitosDesespero.find((e) => numero(e.nivel, 0) === nivel);
    return efeito?.descricao || '';
}

function renderEfeitoDesespero(nivel) {
    const caixa = $('#despero-efeito');
    if (!caixa) return;

    if (!nivel) {
        caixa.innerHTML = `<strong>Nenhum efeito ativo</strong>
            <p>Clique numa caixa para elevar o desespero.</p>`;
        return;
    }

    const efeito = ui.dados.efeitosDesespero.find((e) => numero(e.nivel, 0) === nivel);
    const nome = efeito?.nome || `Nível ${nivel}`;
    const texto = textoEfeito(nivel) || 'Sem descrição.';
    const editado = Boolean(estado.desesperoOverrides?.[nivel]);

    caixa.innerHTML = `
        <strong>${esc(nome)}</strong>
        <p class="despero-texto" id="despero-texto" ${ui.bloqueado ? '' : 'contenteditable="true"'}
           role="textbox" aria-label="Descrição do efeito do desespero">${esc(texto)}</p>
        <div class="d-flex justify-content-between align-items-center mt-1">
            <small class="text-dim">${editado ? 'descrição editada nesta ficha' : 'texto de data/efeitos-desespero.json'}</small>
            <button class="btn btn-ghost btn-xs" id="btn-editar-efeito" type="button">
                ${icone('pencil')} ${editado ? 'voltar ao original' : 'editar'}
            </button>
        </div>`;
}

/* ============================================================
   Atributos
   ============================================================ */

const LISTA_ATRIBUTOS = [
    { chave: 'fisico', nome: 'Físico' },
    { chave: 'agilidade', nome: 'Agilidade' },
    { chave: 'forca', nome: 'Força' },
    { chave: 'carisma', nome: 'Carisma' },
    { chave: 'inteligencia', nome: 'Inteligência' },
    { chave: 'energiaAmaldicoada', nome: 'Energia Amaldiçoada' }
];

function construirAtributos() {
    const container = $('#atributos-lista');
    if (!container) return;

    container.innerHTML = LISTA_ATRIBUTOS.map((attr) => `
        <div class="attr" title="${esc(attr.nome)} — clique nas setas para ajustar">
            <span class="attr__name">${esc(attr.nome)}</span>
            <div class="d-flex align-items-center gap-1">
                <button class="icon-btn" type="button" data-attr-delta="${attr.chave}" data-delta="-1"
                        aria-label="Diminuir ${esc(attr.nome)}">−</button>
                <span class="attr__value editable" data-bind="atributos.${attr.chave}"
                      contenteditable="false" role="textbox" tabindex="0"
                      aria-label="${esc(attr.nome)}">10</span>
                <button class="icon-btn" type="button" data-attr-delta="${attr.chave}" data-delta="1"
                        aria-label="Aumentar ${esc(attr.nome)}">+</button>
            </div>
            <span class="attr__base" data-attr-base="${attr.chave}">base 10</span>
        </div>`).join('');
}

function ajustarAtributo(chave, delta) {
    if (!podeEditar()) return;
    const antes = numero(estado.atributos[chave], 10);
    const depois = Math.max(0, antes + delta);
    definir(`atributos.${chave}`, depois);
    ficha.aplicarDerivados(estado);
    alterado('atributo');
}

/* ============================================================
   Perícias (RF09)
   ============================================================ */

function construirPericias() {
    const container = $('#pericias-lista');
    if (!container) return;

    if (!ui.dados.pericias.length) {
        container.innerHTML = `
            <div class="empty-state">
                ${icone('dice-5')}
                <strong>Nenhuma perícia carregada</strong>
                <p>Rode a página por um servidor local para carregar <code>data/pericias.json</code>.</p>
            </div>`;
        return;
    }

    // Agrupa mantendo a ordem do arquivo.
    const grupos = new Map();
    ui.dados.pericias.forEach((pericia) => {
        if (!grupos.has(pericia.grupo)) grupos.set(pericia.grupo, []);
        grupos.get(pericia.grupo).push(pericia);
    });

    container.innerHTML = Array.from(grupos.entries()).map(([grupo, lista]) => `
        <section class="skill-group">
            <h3 class="skill-group__title">${esc(grupo)}</h3>
            ${lista.map((pericia) => `
                <div class="skill" data-skill="${esc(pericia.nome)}">
                    <span class="skill__name" title="${esc(pericia.nome)}">${esc(pericia.nome)}</span>
                    <span class="skill__attr" title="Bônus do atributo">${esc(pericia.atributo)}</span>
                    <span class="skill__value editable" data-lista="pericias" data-id="${esc(pericia.nome)}"
                          data-prop="valor" contenteditable="false" role="textbox" tabindex="0"
                          aria-label="Valor da perícia ${esc(pericia.nome)}">0</span>
                    <button class="skill__roll" type="button" data-roll="${esc(pericia.nome)}"
                            data-attr="${esc(pericia.atributo)}"
                            aria-label="Rolar ${esc(pericia.nome)}" title="Rolar 1d20 + perícia + atributo">
                        ${icone('dice-5')}
                    </button>
                </div>`).join('')}
        </section>`).join('');

    // Garante que toda perícia tenha valor
    ui.dados.pericias.forEach((pericia) => {
        if (estado.pericias[pericia.nome] == null) estado.pericias[pericia.nome] = 0;
    });
    renderPericias();
}

function renderPericias() {
    ui.dados.pericias.forEach((pericia) => {
        const celula = $(`[data-lista="pericias"][data-id="${cssEscape(pericia.nome)}"]`);
        if (!celula) return;
        if (document.activeElement === celula) return;
        celula.textContent = numero(estado.pericias[pericia.nome], 0);
    });
}

/** Escapa caracteres especiais de seletores CSS (nomes com acento/espaço). */
function cssEscape(valor) {
    return window.CSS?.escape ? CSS.escape(String(valor)) : String(valor).replace(/["\\]/g, '\\$&');
}

function rolar(nome, siglaAtributo, silencioso = false) {
    const rolagem = ficha.rolarPericia(nome, siglaAtributo);
    const celula = $(`[data-skill="${cssEscape(nome)}"] .skill__value`);
    if (celula) {
        const linha = celula.closest('.skill');
        linha?.classList.add('is-rolling');
        setTimeout(() => linha?.classList.remove('is-rolling'), 350);
    }

    if (!silencioso) {
        const partes = [`1d20 = ${rolagem.d20}`];
        if (rolagem.valorPericia) partes.push(`${rolagem.valorPericia} de perícia`);
        if (rolagem.bonus) partes.push(`${rolagem.bonus} de ${siglaAtributo || 'atributo'}`);
        const conta = ` (${partes.join(' + ')})`;

        if (rolagem.critico) {
            toast(`${nome}: ${rolagem.total}${conta} — CRÍTICO!`, 'sucesso', 4200);
        } else if (rolagem.falha) {
            toast(`${nome}: ${rolagem.total}${conta} — falha crítica!`, 'erro', 4200);
        } else {
            toast(`${nome}: ${rolagem.total}${conta}`, 'info', 2600);
        }
    }

    alterado('rolagem');
    return rolagem;
}

function renderRolagens() {
    const lista = $('#rolagens-lista');
    if (!lista) return;

    if (!estado.rolagens.length) {
        lista.innerHTML = '<li class="rolls__empty">Nenhuma rolagem ainda — clique no dado de uma perícia.</li>';
        return;
    }

    lista.innerHTML = estado.rolagens.slice(0, 14).map((r) => {
        const classe = r.critico ? 'roll--crit' : r.falha ? 'roll--falha' : '';
        const marca = r.critico ? ' ✦ crítico' : r.falha ? ' ✖ falha' : '';
        return `<li class="roll ${classe}">
            <span>${esc(r.pericia)}</span>
            <span class="roll__dado">${r.d20}</span>
            <b>${r.total}</b>
            <span>${marca}</span>
        </li>`;
    }).join('');
}

/* ============================================================
   Inventário (RF06)
   ============================================================ */

function renderEquipamentos() {
    const lista = $('#equip-lista');
    if (!lista) return;

    const totalQtd = estado.equipamentos.reduce((soma, i) => soma + numero(i.quantidade, 1), 0);
    const totalPeso = estado.equipamentos.reduce((soma, i) => soma + numero(i.quantidade, 1) * numero(i.peso, 0), 0);
    $('#equip-total-qtd').textContent = totalQtd;
    $('#equip-total-peso').textContent = totalPeso;

    if (!estado.equipamentos.length) {
        lista.innerHTML = `
            <div class="empty-state">
                ${icone('inbox')}
                <strong>Mochila vazia</strong>
                <p>Use “Equipamento” para puxar itens da lista de data/equipamentos.json.</p>
            </div>`;
        return;
    }

    lista.innerHTML = estado.equipamentos.map((item) => `
        <div class="item" data-item-id="${esc(item.id)}">
            <span class="item__glyph">${icone('backpack')}</span>
            <span class="item__name editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                  data-lista="equipamentos" data-id="${esc(item.id)}" data-prop="nome"
                  role="textbox" tabindex="0" aria-label="Nome do equipamento">${esc(item.nome)}</span>
            <span class="item__meta">
                <span title="Quantidade">×<b class="editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                      data-lista="equipamentos" data-id="${esc(item.id)}" data-prop="quantidade"
                      role="textbox" tabindex="0" aria-label="Quantidade">${numero(item.quantidade, 1)}</b></span>
                <span title="Peso por unidade"><b class="editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                      data-lista="equipamentos" data-id="${esc(item.id)}" data-prop="peso"
                      role="textbox" tabindex="0" aria-label="Peso">${numero(item.peso, 1)}</b>p</span>
            </span>
            <span class="item__desc editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                  data-lista="equipamentos" data-id="${esc(item.id)}" data-prop="descricao"
                  role="textbox" tabindex="0" aria-label="Dano ou descrição">${esc(item.descricao || '—')}</span>
            <span class="item__actions">
                <button class="icon-btn icon-btn--danger" type="button" data-remove="equipamento"
                        data-id="${esc(item.id)}" aria-label="Remover ${esc(item.nome)}"
                        title="Remover">${icone('trash3')}</button>
            </span>
        </div>`).join('');
}

/* ============================================================
   Maldições (RF06) — agrupadas por nível desbloqueado
   ============================================================ */

function renderMaldicoes() {
    const lista = $('#maldicoes-lista');
    if (!lista) return;

    const nivel = numero(estado.nivel, 1);
    const daTrilha = estado.maldicoes.filter((m) => m.origem === 'trilha');
    const proprias = estado.maldicoes.filter((m) => m.origem !== 'trilha');
    const trilhadas = daTrilha.filter((m) => numero(m.nivel, 0) <= nivel);
    const bloqueadas = daTrilha.filter((m) => numero(m.nivel, 0) > nivel);

    if (!estado.maldicoes.length) {
        lista.innerHTML = `
            <div class="empty-state">
                ${icone('flower1')}
                <strong>Nenhuma maldição</strong>
                <p>Escolha uma trilha acima ou crie a sua própria maldição.</p>
            </div>`;
        return;
    }

    const cartao = (m) => `
        <div class="item item--curse ${m.ativa ? 'is-active' : 'is-inactive'}" data-item-id="${esc(m.id)}">
            <span class="item__glyph">${icone('flower1')}</span>
            <span class="item__name editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                  data-lista="maldicoes" data-id="${esc(m.id)}" data-prop="nome"
                  role="textbox" tabindex="0" aria-label="Nome da maldição">${esc(m.nome)}</span>
            <span class="item__meta">
                <span title="Custo em PA">${esc(m.custo || '—')}</span>
                <span title="Elemento">${esc(m.elemento || 'N/A')}</span>
                ${m.origem === 'trilha' ? `<span class="item__level">nv ${numero(m.nivel, 1)}</span>` : ''}
                <label class="switch-mini">
                    <input type="checkbox" data-toggle-curse="${esc(m.id)}" ${m.ativa ? 'checked' : ''}
                           ${ui.bloqueado ? 'disabled' : ''}>
                    ${m.ativa ? 'ativa' : 'inativa'}
                </label>
            </span>
            <span class="item__desc editable" contenteditable="${ui.bloqueado ? 'false' : 'true'}" tabindex="0"
                  data-lista="maldicoes" data-id="${esc(m.id)}" data-prop="descricao"
                  role="textbox" tabindex="0" aria-label="Descrição da maldição">${esc(m.descricao || '—')}</span>
            <span class="item__actions">
                <button class="icon-btn icon-btn--danger" type="button" data-remove="maldicao"
                        data-id="${esc(m.id)}" aria-label="Remover ${esc(m.nome)}"
                        title="Remover">${icone('trash3')}</button>
            </span>
        </div>`;

    lista.innerHTML = [
        trilhadas.length
            ? `<h3 class="item__group-title">Desbloqueadas pela trilha · ${trilhadas.length}</h3>` + trilhadas.map(cartao).join('')
            : '',
        proprias.length
            ? `<h3 class="item__group-title">Maldições próprias · ${proprias.length}</h3>` + proprias.map(cartao).join('')
            : '',
        bloqueadas.length
            ? `<h3 class="item__group-title is-locked">Bloqueadas (nível ${nivel}) · ${bloqueadas.length}</h3>`
                + bloqueadas.map(cartao).join('')
            : ''
    ].join('');
}

/* ============================================================
   Condições (RF10)
   ============================================================ */

function construirCondicoes() {
    const lista = $('#condicoes-lista');
    if (!lista) return;

    lista.innerHTML = ui.dados.condicoes.map((condicao) => `
        <li class="cond" data-condicao="${esc(condicao.id)}" style="color:${esc(condicao.cor || '#888')}"
            role="button" tabindex="0" aria-pressed="false">
            <div class="cond__head">
                <span class="cond__dot" aria-hidden="true"></span>
                <span>${esc(condicao.nome)}</span>
            </div>
            <p class="cond__desc">${esc(condicao.descricao)}</p>
        </li>`).join('');
}

function alternarCondicao(id, forcar) {
    const atual = Boolean(estado.condicoes[id]);
    const novo = typeof forcar === 'boolean' ? forcar : !atual;
    estado.condicoes[id] = novo;

    const cond = ui.dados.condicoes.find((c) => c.id === id);
    toast(`${cond?.nome || id}: ${novo ? 'aplicada' : 'removida'}`, novo ? 'aviso' : 'info', 1800);
    alterado('condicao');
    renderCondicoes();
    renderBadges();
}

/** Marca no painel quais condições estão ativas (a lista é criada uma vez). */
function renderCondicoes() {
    $$('[data-condicao]').forEach((item) => {
        const ativa = Boolean(estado.condicoes[item.dataset.condicao]);
        item.classList.toggle('is-on', ativa);
        item.setAttribute('aria-pressed', String(ativa));
    });
}

/* ============================================================
   Trilha e autocomplete (RF07)
   ============================================================ */

let sugestoesAtivas = null;

function fecharTodosOsAutocompletes() {
    $$('.autocomplete').forEach((caixa) => {
        caixa.hidden = true;
        caixa.innerHTML = '';
    });
    sugestoesAtivas = null;
    $$('[role="combobox"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
}

/**
 * Desenha as sugestões de um autocomplete.
 * @param {HTMLElement} caixa
 * @param {Array<{html:string, aoEscolher:Function}>} itens
 */
function mostrarSugestoes(caixa, itens, textoVazio = 'Nada encontrado.') {
    if (!caixa) return;
    if (!itens.length) {
        caixa.innerHTML = `<div class="autocomplete__empty">${esc(textoVazio)}</div>`;
        caixa.hidden = false;
        return;
    }
    caixa.innerHTML = itens.map((item, indice) =>
        `<div class="autocomplete__item" role="option" data-indice="${indice}" tabindex="0">${item.html}</div>`
    ).join('');
    caixa.hidden = false;
    caixa._itens = itens;
    sugestoesAtivas = caixa;
}

async function abrirSugestoesTrilha(forcar = false) {
    const caixa = $('#path-suggestions');
    const campo = $('#ficha-trilha');
    if (!caixa || !campo) return;

    if (!ui.dados.trilhas.length) {
        await dados.trilhas().then((lista) => { ui.dados.trilhas = lista; });
    }

    const busca = normalizar(campo.textContent.trim());
    const filtradas = (forcar ? ui.dados.trilhas : ui.dados.trilhas)
        .filter((t) => !busca || normalizar(t.nome).includes(busca))
        .slice(0, 40);

    if (!ui.dados.trilhas.length) {
        mostrarSugestoes(caixa, [], dados.protocoloDeArquivo
            ? 'Não foi possível ler data/trilhas.json (abra por um servidor local — veja README.md).'
            : 'Nenhuma trilha em data/trilhas.json.');
        campo.setAttribute('aria-expanded', 'true');
        return;
    }

    mostrarSugestoes(caixa, filtradas.map((trilha) => ({
        html: `<span class="autocomplete__title">${esc(trilha.nome)}
                <span class="autocomplete__tag">${trilha.maldicoes?.length || 0} maldições</span></span>
               <span class="autocomplete__sub">${esc(trilha.resumo || '')}</span>`,
        aoEscolher: () => escolherTrilha(trilha)
    })));
    campo.setAttribute('aria-expanded', 'true');
}

function escolherTrilha(trilha) {
    if (!podeEditar()) return;

    estado.trilha = { nome: trilha.nome, resumo: trilha.resumo || '' };
    const resultado = ficha.sincronizarMaldicoesDaTrilha(estado, trilha);

    // Escreve no campo e solta o foco para a tela refletir a escolha
    const campo = $('#ficha-trilha');
    if (campo) {
        campo.textContent = trilha.nome;
        campo.blur();
    }

    fecharTodosOsAutocompletes();
    renderizar();
    renderMaldicoes();
    alterado('trilha');

    if (resultado.novas.length) {
        toast(`Trilha ${trilha.nome}: ${resultado.novas.length} maldição(ões) liberada(s).`, 'sucesso');
    } else if (resultado.removidas.length) {
        toast(`Trilha ${trilha.nome}: ${resultado.removidas.length} maldição(ões) removida(s).`, 'aviso');
    } else {
        toast(`Trilha ${trilha.nome} selecionada.`, 'sucesso');
    }
}

function renderTrilha() {
    const trilha = ficha.acharTrilha(ui.dados.trilhas, estado.trilha.nome);
    const progresso = $('#path-progresso');
    const tag = $('#path-tag');

    if (tag) tag.textContent = trilha ? 'ativa' : (estado.trilha.nome ? 'personalizada' : 'nenhuma');

    if (!trilha) {
        if (progresso) progresso.hidden = true;
        return;
    }

    const info = ficha.progressoTrilha(trilha, numero(estado.nivel, 1));
    if (!progresso) return;
    progresso.hidden = false;
    $('#path-progresso-fill').style.width = info.percentual + '%';
    $('#path-progresso-texto').textContent = info.proxima
        ? `${info.liberadas} de ${info.total} maldições · próxima no nível ${numero(info.proxima.nivel, 0)}`
        : `${info.liberadas} de ${info.total} maldições · trilha completa`;
}

/* ============================================================
   Autocomplete de equipamentos (dentro do modal)
   ============================================================ */

async function abrirSugestoesEquipamento() {
    const caixa = $('#equip-suggestions');
    const campo = $('#equip-nome');
    if (!caixa || !campo) return;

    if (!ui.dados.equipamentos.length) {
        await dados.equipamentos().then((lista) => { ui.dados.equipamentos = lista; });
    }

    const busca = normalizar(campo.value.trim());
    const filtrados = ui.dados.equipamentos
        .filter((item) => !busca || normalizar(item.nome).includes(busca))
        .slice(0, 50);

    if (!ui.dados.equipamentos.length) {
        mostrarSugestoes(caixa, [], dados.protocoloDeArquivo
            ? 'Sem acesso a data/equipamentos.json — rode por um servidor local.'
            : 'Nenhum equipamento cadastrado em data/equipamentos.json.');
        return;
    }

    mostrarSugestoes(caixa, filtrados.map((item) => ({
        html: `<span class="autocomplete__title">${esc(item.nome)}
                <span class="autocomplete__tag">${esc(item.categoria || 'item')} · ${numero(item.peso, 1)}p</span></span>
               <span class="autocomplete__sub">${esc(item.dano || '')}</span>`,
        aoEscolher: () => {
            campo.value = item.nome;
            $('#equip-dano').value = item.dano || '';
            $('#equip-peso').value = numero(item.peso, 1);
            fecharTodosOsAutocompletes();
        }
    })));
}

function escolherSugestao(indice) {
    const caixa = sugestoesAtivas;
    if (!caixa?._itens?.[indice]) return;
    caixa._itens[indice].aoEscolher();
}

/* ============================================================
   Cabeçalho: badges e condições ativas
   ============================================================ */

/* Cores progressivas do desespero, iguais às das caixas. */
const CORES_DESPERO = ['', '#43d17c', '#f0d33c', '#ffa447', '#ff4d4d'];

function renderBadges() {
    const nivel = numero(estado.nivel, 1);
    const desespero = numero(estado.despero, 0);

    $$('[data-text]').forEach((el) => {
        const valor = obter(el.dataset.text);
        let texto = (valor === '' || valor == null) ? '—' : String(valor);
        if (el.dataset.text === 'trilha.nome' && !valor) texto = 'sem trilha';
        if (el.dataset.text === 'nivel') texto = String(nivel);
        if (el.dataset.text === 'desespero') texto = String(desespero);
        if (el.textContent !== texto) el.textContent = texto;
    });

    const chipDesespero = $('#badge-desespero');
    if (chipDesespero && desespero > 0) {
        chipDesespero.style.borderColor = CORES_DESPERO[ficha.faixaDesespero(desespero)];
        chipDesespero.style.color = CORES_DESPERO[ficha.faixaDesespero(desespero)];
        chipDesespero.title = `Desespero ${desespero}/15 — nível atual: ${textoEfeito(desespero) || 'sem descrição'}`;
    }

    const chipNivel = $('#badge-nivel');
    if (chipNivel) chipNivel.title = `Nível ${nivel} — ${ficha.calcularDerivados(estado).hpMax} HP no total`;

    // Condições ativas no cabeçalho (RF10)
    const container = $('#badges-condicoes');
    if (container) {
        const ativas = ui.dados.condicoes.filter((c) => estado.condicoes[c.id]);
        container.innerHTML = ativas.map((c) =>
            `<span class="badge-cond" style="color:${esc(c.cor)}" title="${esc(c.descricao)}">${esc(c.nome)}</span>`
        ).join('');

        const contador = $('#condicoes-contador');
        if (contador) {
            contador.textContent = ativas.length;
            contador.hidden = ativas.length === 0;
        }
    }
}

/* ============================================================
   Render principal
   ============================================================ */

/** Atualiza as partes "derivadas" da tela (barras, contadores, listas fixas). */
function renderizar() {
    sincronizarCampos();
    renderRecursos();
    renderDerivados();
    renderBadges();
    renderDesespero();
    renderRolagens();
    renderTrilha();
    renderPericias();
}

/* Motivos de alteração que exigem repintar a tela.
   Uma edição de texto só precisa atualizar o resto da ficha —
   o campo em edição nunca é sobrescrito (ver sincronizarCampos). */
const MOTIVOS_REPINTAR = new Set([
    'campo', 'atributo', 'recurso', 'item', 'pericia', 'recalculo', 'desfazer', 'trilha', 'rolagem'
]);

/* ============================================================
   Ações destrutivas
   ============================================================ */

async function removerItem(tipo, id) {
    const lista = estado[tipo === 'maldicao' ? 'maldicoes' : 'equipamentos'] || [];
    const item = lista.find((i) => String(i.id) === String(id));
    if (!item) return;

    const ok = await confirmar({
        titulo: 'Remover item',
        texto: `Remover "${item.nome}" da ficha? Se for um engano, exporte um JSON antes de mexer.`,
        rotuloOk: 'Remover'
    });
    if (!ok) return;

    estado[tipo === 'maldicao' ? 'maldicoes' : 'equipamentos'] =
        lista.filter((i) => String(i.id) !== String(id));

    if (tipo === 'maldicao') renderMaldicoes(); else renderEquipamentos();
    alterado('remocao');
    toast(`"${item.nome}" removido.`, 'info');
}

/* ============================================================
   Importar / Exportar (RF11)
   ============================================================ */

function baixarArquivo(nomeArquivo, conteudo, tipoMime) {
    const blob = new Blob([conteudo], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomeDoArquivo(extension) {
    const nome = (estado.personagem || estado.nome || 'ficha')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${nome || 'ficha'}_last_paige.${extension}`;
}

function exportarJSON() {
    const dadosExportados = ficha.serializar(estado);
    baixarArquivo(nomeDoArquivo('json'), JSON.stringify(dadosExportados, null, 2), 'application/json');
    toast('JSON exportado. Guarde em local seguro.', 'sucesso');
}

function exportarPDF() {
    toast('Abrindo a janela de impressão — escolha “Salvar como PDF”.', 'info', 4200);
    setTimeout(() => window.print(), 350);
}

/* O html2canvas original não entende cores modernas (color-mix),
   então usamos o fork "pro"; se ele falhar, tentamos o original. */
const CDN_CANVAS = [
    {
        url: 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.11/dist/html2canvas-pro.min.js',
        global: 'html2canvas'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        global: 'html2canvas'
    }
];

/** Carrega um script externo só quando o jogador realmente precisa dele. */
function carregarScriptExterno(src) {
    return new Promise((resolve, reject) => {
        const existente = document.querySelector(`script[src="${src}"]`);
        if (existente) {
            if (existente.dataset.carregado) resolve(true);
            else {
                existente.addEventListener('load', () => resolve(true), { once: true });
                existente.addEventListener('error', () => reject(new Error('falha ao carregar')), { once: true });
            }
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.addEventListener('load', () => {
            script.dataset.carregado = '1';
            resolve(true);
        }, { once: true });
        script.addEventListener('error', () => reject(new Error('sem internet')), { once: true });
        document.head.appendChild(script);
    });
}

async function exportarPNG() {
    toast('Preparando a imagem… (dependência carregada sob demanda)', 'info', 2600);

    let render = null;
    for (const opcao of CDN_CANVAS) {
        try {
            await carregarScriptExterno(opcao.url);
            if (typeof globalThis[opcao.global] === 'function') {
                render = globalThis[opcao.global];
                break;
            }
        } catch (erro) {
            console.warn('[png] CDN indisponível:', opcao.url, erro);
        }
    }

    if (!render) {
        toast('Exportar PNG precisa de internet (biblioteca via CDN). O PDF funciona offline.', 'aviso', 6000);
        return;
    }

    try {
        const area = document.querySelector('.app-main');
        const canvas = await render(area, {
            backgroundColor: getComputedStyle(document.body).backgroundColor || '#0a0a0a',
            scale: Math.min(2, window.devicePixelRatio || 1),
            useCORS: true,
            logging: false,
            ignoreElements: (el) => el.classList?.contains('bg-runes')
        });

        canvas.toBlob((blob) => {
            if (!blob) {
                toast('Não consegui gerar o PNG.', 'erro');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = nomeDoArquivo('png');
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast('PNG exportado.', 'sucesso');
        }, 'image/png');
    } catch (erro) {
        console.warn('[png]', erro);
        toast('Não consegui gerar o PNG neste navegador. Use "Exportar PDF".', 'aviso', 6000);
    }
}

function importarArquivo(arquivo) {
    const leitor = new FileReader();
    leitor.onload = async () => {
        try {
            const bruto = JSON.parse(leitor.result);
            const { ficha: nova, avisos, formato } = ficha.desserializar(bruto);

            const ok = await confirmar({
                titulo: 'Importar ficha',
                texto: `A importação (formato ${formato}) vai substituir o conteúdo da ficha atual. Continuar?`,
                rotuloOk: 'Importar',
                perigo: false
            });
            if (!ok) return;

            substituirEstado(nova);
            ui.fichaId = ui.fichaId || storage.criarFicha(nova.nome || 'Ficha importada').id;
            salvamento.definirFicha(ui.fichaId);

            await sincronizarTrilhaDoEstado();
            renderizar();
            renderPericias();
            renderEquipamentos();
            renderMaldicoes();
            renderCondicoes();
            salvarAgora(true);
            toast('Ficha importada com sucesso.', 'sucesso');

            if (avisos.length) {
                console.warn('[importar] avisos:', avisos);
                toast(`${avisos.length} aviso(s) sobre campos ausentes — veja o console.`, 'aviso', 6000);
            }
        } catch (erro) {
            console.error('[importar]', erro);
            toast('Arquivo inválido: ' + erro.message, 'erro', 5000);
        }
    };
    leitor.onerror = () => toast('Não consegui ler o arquivo.', 'erro');
    leitor.readAsText(arquivo);
}

/* ============================================================
   Gestão de fichas (RF01)
   ============================================================ */

function abrirListaDeFichas() {
    const lista = $('#fichas-lista');
    if (!lista) return;

    const fichas = storage.listarFichas();
    if (!fichas.length) {
        lista.innerHTML = '<li class="modal-hint">Nenhuma ficha salva ainda.</li>';
        return;
    }

    lista.innerHTML = fichas.map((f) => `
        <li class="sheet-list__item ${f.id === ui.fichaId ? 'is-current' : ''}">
            <div>
                <div class="sheet-list__name">${esc(f.nome || 'Sem título')}</div>
                <div class="sheet-list__meta">
                    ${esc(f.personagem || 'sem personagem')} · nível ${esc(f.nivel || '?')}
                    · ${new Date(f.atualizadoEm || Date.now()).toLocaleString('pt-BR')}
                    ${f.id === ui.fichaId ? ' · <strong>atual</strong>' : ''}
                </div>
            </div>
            <button class="btn btn-accent btn-xs" data-abrir-ficha="${esc(f.id)}"
                    ${f.id === ui.fichaId ? 'disabled' : ''}>Abrir</button>
        </li>`).join('');
}

async function trocarFicha(id) {
    const conteudo = storage.lerFicha(id);
    if (!conteudo) {
        toast('Ficha não encontrada no armazenamento.', 'erro');
        return;
    }
    if (salvamento.temPendente) salvamento.salvarAgora();

    substituirEstado(conteudo);
    ui.fichaId = id;
    storage.definirAtiva(id);
    salvamento.definirFicha(id);

    await sincronizarTrilhaDoEstado();
    renderizar();
    renderPericias();
    renderEquipamentos();
    renderMaldicoes();
    renderCondicoes();
    abrirListaDeFichas();
    feedback(`ficha: ${conteudo.nome || 'sem título'}`);
    toast('Ficha aberta.', 'sucesso');
}

function novaFicha() {
    const nome = window.prompt('Nome da nova ficha:', 'Nova ficha');
    if (nome === null) return;
    if (salvamento.temPendente) salvamento.salvarAgora();

    const registro = storage.criarFicha(nome.trim() || 'Nova ficha');
    ui.fichaId = registro.id;
    storage.definirAtiva(registro.id);
    salvamento.definirFicha(registro.id);

    substituirEstado(criarEstadoInicial());
    estado.nome = nome.trim() || 'Nova ficha';

    renderizar();
    renderPericias();
    renderEquipamentos();
    renderMaldicoes();
    abrirListaDeFichas();
    salvarAgora(true);
    toast(`Ficha "${estado.nome}" criada e pronta para preencher.`, 'sucesso');
    // Ficha nova já começa desbloqueada para você preencher sem atalho.
    ui.bloqueado = false;
    aplicarModoBloqueio();
}

async function apagarFichaAtual() {
    const ok = await confirmarDuplo(
        `A ficha "${estado.nome}" será apagada deste navegador. Não há como recuperar.`
    );
    if (!ok) return;

    const restantes = storage.listarFichas().filter((f) => f.id !== ui.fichaId);
    storage.removerFicha(ui.fichaId);
    ui.fichaId = null;

    if (restantes.length) {
        await trocarFicha(restantes[0].id);
    } else {
        const nova = storage.criarFicha('Nova ficha');
        ui.fichaId = nova.id;
        storage.definirAtiva(nova.id);
        salvamento.definirFicha(nova.id);
        substituirEstado(criarEstadoInicial());
        renderizar();
        renderEquipamentos();
        renderMaldicoes();
        salvarAgora(true);
    }
    toast('Ficha apagada.', 'info');
}

async function limparFichaAtual() {
    const ok = await confirmarDuplo(
        'Todos os campos, itens, maldições e condições desta ficha serão apagados. Continua?'
    );
    if (!ok) return;

    const nome = estado.nome;
    substituirEstado(criarEstadoInicial());
    estado.nome = nome;
    estado.equipamentos = [];
    estado.maldicoes = [];
    estado.pericias = {};
    estado.condicoes = {};
    estado.despero = 0;
    estado.rolagens = [];
    estado.historico = [];

    renderizar();
    renderEquipamentos();
    renderMaldicoes();
    renderCondicoes();
    salvarAgora(true);
    toast('Ficha limpa. Dica: exporte um JSON antes de começar a mesa de novo.', 'aviso', 5200);
}

/* ============================================================
   Música
   ============================================================ */

function iniciarMusica() {
    const audio = $('#bgMusic');
    const botao = $('#btn-audio');
    if (!audio) return;

    audio.volume = 0.28;

    const atualizarBotao = () => {
        const tocando = !audio.paused;
        botao?.setAttribute('aria-pressed', String(tocando));
        const iconeEl = botao?.querySelector('i');
        if (iconeEl) iconeEl.className = 'bi bi-' + (tocando ? 'volume-up' : 'volume-mute');
        botao?.setAttribute('aria-label', tocando ? 'Desligar a música' : 'Ligar a música');
    };

    const tocar = () => {
        audio.play().then(atualizarBotao).catch(() => {
            // Navegador bloqueou o autoplay: espera o primeiro clique.
            document.addEventListener('pointerdown', function aoPrimeiroToque() {
                audio.play().then(atualizarBotao).catch(() => {});
                document.removeEventListener('pointerdown', aoPrimeiroToque);
            }, { once: true });
        });
    };

    botao?.addEventListener('click', () => {
        if (audio.paused) tocar();
        else audio.pause();
        atualizarBotao();
    });

    // Só tenta tocar depois da primeira interação (política dos navegadores).
    if (!ui.bloqueado) document.addEventListener('pointerdown', tocar, { once: true });
    else document.addEventListener('pointerdown', tocar, { once: true });
    atualizarBotao();
}

/* ============================================================
   Atalhos de teclado (RF03 / RF12)
   ============================================================ */

function digitandoEmCampo() {
    const ativo = document.activeElement;
    if (!ativo) return false;
    return ativo.isContentEditable || ['INPUT', 'TEXTAREA'].includes(ativo.tagName);
}

function registrarAtalhos() {
    document.addEventListener('keydown', (evento) => {
        const ctrl = evento.ctrlKey || evento.metaKey;

        if (ctrl && evento.key.toLowerCase() === 'e') {
            evento.preventDefault();
            alternarEdicao();
            return;
        }
        if (ctrl && evento.key.toLowerCase() === 's') {
            evento.preventDefault();
            salvarAgora();
            return;
        }
        if (ctrl && evento.key.toLowerCase() === 'p') {
            evento.preventDefault();
            exportarPDF();
            return;
        }
        if (ctrl && evento.key.toLowerCase() === 'z' && !digitandoEmCampo()) {
            evento.preventDefault();
            const rotulo = desfazer();
            if (rotulo) {
                renderizar();
                renderPericias();
                renderEquipamentos();
                renderMaldicoes();
                toast(`Desfeito: ${rotulo}`, 'info', 2200);
                alterado('desfazer');
            } else {
                toast('Nada para desfazer.', 'info', 1600);
            }
            return;
        }
        if (evento.key === 'Escape') {
            fecharTodosOsAutocompletes();
        }
    });
}

/* ============================================================
   Eventos delegados (um listener só, sem poluir o HTML)
   ============================================================ */

function registrarEventos() {
    /* --- edição de campos ligados --- */
    document.addEventListener('input', (evento) => {
        const el = evento.target;

        if (el.matches?.('[data-bind]')) {
            if (ui.bloqueado) return;
            aoEditarCampo(el.dataset.bind, el.textContent, el);
            return;
        }

        if (el.matches?.('[data-lista]')) {
            if (ui.bloqueado) return;

            // Perícias: dicionário nome -> valor
            if (el.dataset.lista === 'pericias') {
                const nome = el.dataset.id;
                estado.pericias[nome] = numero(el.textContent, 0);
                alterado('pericia');
                el.classList.add('editable--live');
                setTimeout(() => el.classList.remove('editable--live'), 700);
                return;
            }

            const item = (estado[el.dataset.lista] || []).find((i) => String(i.id) === String(el.dataset.id));
            if (!item) return;
            const prop = el.dataset.prop;
            const numerico = ['quantidade', 'peso'].includes(prop);
            item[prop] = numerico ? numero(el.textContent, 0) : el.textContent;
            alterado('item');
            if (numerico) renderEquipamentos();
            el.classList.add('editable--live');
            setTimeout(() => el.classList.remove('editable--live'), 700);
        }
    });

    document.addEventListener('focusout', (evento) => {
        const el = evento.target;
        if (el.matches?.('[data-bind]')) {
            normalizarCampo(el.dataset.bind, el);
            el.classList.remove('editable--live');
            // Ao sair do campo a tela inteira pode ser sincronizada
            // (o campo em edição é pulado por sincronizarCampos).
            setTimeout(renderizar, 0);
        }
        if (el.matches?.('[data-lista]') && ['quantidade', 'peso'].includes(el.dataset.prop)) {
            const item = (estado[el.dataset.lista] || []).find((i) => String(i.id) === String(el.dataset.id));
            if (item) {
                item[el.dataset.prop] = Math.max(0, numero(el.textContent, 0));
                el.textContent = item[el.dataset.prop];
                renderEquipamentos();
                alterado('item');
            }
        }
    });

    /* --- ENTER em campo curto deve sair do campo (Shift+ENTER quebra linha) --- */
    document.addEventListener('keydown', (evento) => {
        const el = evento.target;
        if (evento.key !== 'Enter' || evento.shiftKey) return;
        if (!el.matches?.('[data-bind]')) return;
        if (el.getAttribute('aria-multiline') === 'true') return;
        evento.preventDefault();
        el.blur();
    });

    /* --- clique geral --- */
    document.addEventListener('click', async (evento) => {
        const alvo = evento.target;

        // Botões de recurso
        const botaoAjuste = alvo.closest?.('[data-adj]');
        if (botaoAjuste) {
            atualizarRecurso(botaoAjuste.dataset.adj, numero(botaoAjuste.dataset.delta, 0));
            return;
        }

        const botaoDesfazer = alvo.closest?.('[data-undo]');
        if (botaoDesfazer && !botaoDesfazer.disabled) {
            const rotulo = desfazer();
            renderizar();
            if (rotulo) toast(`Desfeito: ${rotulo}`, 'info', 2000);
            alterado('desfazer');
            return;
        }

        // Atributos +/-
        const botaoAttr = alvo.closest?.('[data-attr-delta]');
        if (botaoAttr) {
            ajustarAtributo(botaoAttr.dataset.attrDelta, numero(botaoAttr.dataset.delta, 0));
            return;
        }

        // Recalcular
        if (alvo.closest?.('#btn-recalcular')) {
            const d = ficha.aplicarDerivados(estado);
            aoMudarNivel();
            renderizar();
            toast(`Recalculado: HP ${d.hpMax} · PA ${d.paMax} · DT ${d.dt}`, 'sucesso');
            alterado('recalculo');
            return;
        }

        // Desespero
        const caixaDesespero = alvo.closest?.('.dbox');
        if (caixaDesespero) {
            const novo = numero(caixaDesespero.dataset.nivel, 0);
            const resultado = ficha.definirDesespero(novo, ui.dados.efeitosAutomaticos);
            renderizar();
            resultado.avisos.forEach((aviso) => toast(aviso, 'erro', 5200));
            alterado('desespero');
            return;
        }

        // Editar descrição do efeito de desespero
        if (alvo.closest?.('#btn-editar-efeito')) {
            const nivel = numero(estado.despero, 0);
            const temOverride = Boolean(estado.desesperoOverrides?.[nivel]);
            if (temOverride) {
                delete estado.desesperoOverrides[nivel];
                toast('Efeito voltou ao texto original do JSON.', 'info');
            } else {
                estado.desesperoOverrides = estado.desesperoOverrides || {};
                estado.desesperoOverrides[nivel] = textoEfeito(nivel);
                toast('Descrição personalizada. Edite o texto abaixo.', 'sucesso');
            }
            estado.desesperoOverrides = estado.desesperoOverrides || {};
            renderDesespero();
            alterado('desespero');
            return;
        }

        // Texto do efeito editável inline
        if (alvo.id === 'desespero-texto' && ui.bloqueado) {
            evento.preventDefault();
        }

        // Rolagem de perícia
        const botaoRoll = alvo.closest?.('[data-roll]');
        if (botaoRoll) {
            rolar(botaoRoll.dataset.roll, botaoRoll.dataset.attr);
            return;
        }
        if (alvo.closest?.('#btn-rolar')) {
            const resultados = ui.dados.pericias.map((p) => rolar(p.nome, p.atributo, true));
            const criticos = resultados.filter((r) => r.critico).length;
            const falhas = resultados.filter((r) => r.falha).length;
            toast(
                `${resultados.length} perícias roladas · ${criticos} crítico(s) · ${falhas} falha(s).`,
                criticos ? 'sucesso' : 'info',
                4200
            );
            return;
        }

        // Condições
        const cond = alvo.closest?.('[data-condicao]');
        if (cond) {
            if (alvo.tagName === 'INPUT') return;
            alternarCondicao(cond.dataset.condicao);
            return;
        }

        // Maldição ativa (checkbox)
        const toggleCurse = alvo.closest?.('[data-toggle-curse]');
        if (toggleCurse) {
            const maldicao = estado.maldicoes.find((m) => String(m.id) === String(toggleCurse.dataset.toggleCurse));
            if (maldicao) {
                maldicao.ativa = toggleCurse.checked;
                alterado('maldicao');
                renderMaldicoes();
                toast(`"${maldicao.nome}" ${maldicao.ativa ? 'ativada' : 'desativada'}.`, 'info', 1600);
            }
            return;
        }

        // Remover item
        const botaoRemover = alvo.closest?.('[data-remove]');
        if (botaoRemover) {
            removerItem(botaoRemover.dataset.remove, botaoRemover.dataset.id);
            return;
        }

        // Sugestão de autocomplete
        const sugestao = alvo.closest?.('.autocomplete__item');
        if (sugestao) {
            escolherSugestao(numero(sugestao.dataset.indice, -1));
            return;
        }

        // Abrir ficha salva
        const abrirFicha = alvo.closest?.('[data-abrir-ficha]');
        if (abrirFicha && !abrirFicha.disabled) {
            await trocarFicha(abrirFicha.dataset.abrirFicha);
            bootstrap.Modal.getOrCreateInstance($('#modalFichas')).hide();
            return;
        }

        // Campo de trilha: abrir sugestões ao clicar
        if (alvo.closest?.('#ficha-trilha')) {
            if (podeEditar()) abrirSugestoesTrilha();
            return;
        }

        // Fechar autocomplete ao clicar fora
        if (!alvo.closest?.('.autocomplete')) fecharTodosOsAutocompletes();
    });

    /* --- barra de recurso: clique, arrasto e teclado --- */
    ['hp', 'pa', 'psi'].forEach((nome) => {
        const barra = $('#bar-' + nome);
        if (!barra) return;
        barra.addEventListener('click', (evento) => ajustarPorBarra(nome, evento));
        barra.addEventListener('keydown', (evento) => ajustarPorTeclado(nome, evento));
    });

    /* --- modais e botões do cabeçalho --- */
    $('#btn-salvar')?.addEventListener('click', () => salvarAgora());
    $('#btn-editar')?.addEventListener('click', () => alternarEdicao());
    $('#btn-bloquear')?.addEventListener('click', () => alternarEdicao());
    $('#btn-export-json')?.addEventListener('click', exportarJSON);
    $('#btn-export-pdf')?.addEventListener('click', exportarPDF);
    $('#btn-export-png')?.addEventListener('click', exportarPNG);
    $('#btn-limpar')?.addEventListener('click', limparFichaAtual);
    $('#btn-add-equip')?.addEventListener('click', () => abrirModal('#modalEquip', '#equip-nome'));
    $('#btn-add-maldicao')?.addEventListener('click', () => abrirModal('#modalMaldicao', '#mald-nome'));
    $('#btn-fichas')?.addEventListener('click', () => { abrirListaDeFichas(); });
    $('#btn-nova-ficha')?.addEventListener('click', novaFicha);
    $('#btn-apagar-ficha')?.addEventListener('click', () => apagarFichaAtual().then(() => abrirListaDeFichas()));
    $('#btn-limpar-condicoes')?.addEventListener('click', () => {
        const total = Object.keys(estado.condicoes).filter((k) => estado.condicoes[k]).length;
        if (!total) {
            toast('Nenhuma condição ativa.', 'info');
            return;
        }
        estado.condicoes = {};
        renderCondicoes();
        renderBadges();
        alterado('condicao');
        toast('Condições removidas.', 'info');
    });

    $('#import-file')?.addEventListener('change', (evento) => {
        const arquivo = evento.target.files?.[0];
        if (arquivo) importarArquivo(arquivo);
        evento.target.value = '';
    });

    $('#btn-tema')?.addEventListener('click', () => {
        const atual = document.documentElement.getAttribute('data-theme');
        const proximo = temas.proximoTema(atual);
        temas.aplicarTema(proximo);
        toast('Tema: ' + temas.porId(proximo).nome, 'info', 1600);
    });

    /* --- painel de condições --- */
    const btnCondicoes = $('#btn-condicoes');
    const painelCondicoes = $('#painel-condicoes');
    btnCondicoes?.addEventListener('click', () => {
        const aberto = btnCondicoes.getAttribute('aria-expanded') === 'true';
        btnCondicoes.setAttribute('aria-expanded', String(!aberto));
        painelCondicoes.hidden = aberto;
    });

    /* --- formulário de equipamento --- */
    $('#form-equip')?.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const nome = $('#equip-nome').value.trim();
        if (!nome) {
            toast('Dê um nome ao equipamento.', 'aviso');
            $('#equip-nome').focus();
            return;
        }
        estado.equipamentos.push({
            id: 'eq' + Date.now().toString(36),
            nome,
            descricao: $('#equip-dano').value.trim(),
            quantidade: Math.max(1, numero($('#equip-qtd').value, 1)),
            peso: Math.max(0, numero($('#equip-peso').value, 1)),
            notas: ''
        });
        evento.target.reset();
        $('#equip-qtd').value = 1;
        $('#equip-peso').value = 1;
        renderEquipamentos();
        alterado('equipamento');
        toast(`"${nome}" adicionado ao inventário.`, 'sucesso');
        bootstrap.Modal.getOrCreateInstance($('#modalEquip')).hide();
    });

    $('#equip-nome')?.addEventListener('input', () => abrirSugestoesEquipamento());
    $('#equip-nome')?.addEventListener('focus', () => abrirSugestoesEquipamento());

    /* --- formulário de maldição --- */
    $('#form-maldicao')?.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const nome = $('#mald-nome').value.trim();
        const descricao = $('#mald-descricao').value.trim();
        if (!nome || !descricao) {
            toast('Preencha nome e descrição da maldição.', 'aviso');
            return;
        }
        estado.maldicoes.push({
            id: 'mal' + Date.now().toString(36),
            nome,
            custo: $('#mald-custo').value.trim() || '1 PA',
            elemento: $('#mald-elemento').value.trim() || 'N/A',
            descricao,
            origem: 'propria',
            trilha: '',
            nivel: 0,
            ativa: $('#mald-ativa').checked
        });
        evento.target.reset();
        renderMaldicoes();
        alterado('maldicao');
        toast(`"${nome}" adicionada às maldições.`, 'sucesso');
        bootstrap.Modal.getOrCreateInstance($('#modalMaldicao')).hide();
    });

    /* --- fechar modal do autocomplete ao clicar fora --- */
    document.addEventListener('pointerdown', (evento) => {
        if (!evento.target.closest?.('.autocomplete') && !evento.target.closest?.('#equip-nome')
            && !evento.target.closest?.('#ficha-trilha')) {
            fecharTodosOsAutocompletes();
        }
    });
}

function abrirModal(seletorModal, seletorCampo) {
    fecharTodosOsAutocompletes();
    const modal = $(seletorModal);
    if (!modal) return;
    bootstrap.Modal.getOrCreateInstance(modal).show();
    modal.addEventListener('shown.bs.modal', () => $(seletorCampo)?.focus(), { once: true });
}

/* ============================================================
   Sincronização da trilha salva (ao abrir/importar uma ficha)
   ============================================================ */

async function sincronizarTrilhaDoEstado() {
    if (!estado.trilha?.nome) return;
    const lista = await dados.trilhas().catch(() => []);
    ui.dados.trilhas = lista;
    const trilha = ficha.acharTrilha(lista, estado.trilha.nome);
    if (trilha) {
        ficha.sincronizarMaldicoesDaTrilha(estado, trilha);
        renderMaldicoes();
    } else {
        toast(`Trilha "${estado.trilha.nome}" não está em data/trilhas.json — mantida como texto.`, 'aviso', 5000);
    }
}

/* ============================================================
   Inicialização
   ============================================================ */

/**
 * Ponto de entrada da interface (chamado pelo main.js).
 * @param {object} contexto
 */
export async function iniciarUI(contexto = {}) {
    // 1. Descobre (ou cria) a ficha ativa
    let id = storage.idAtivo();
    if (!id || !storage.lerFicha(id)) {
        const fichas = storage.listarFichas();
        if (fichas.length) {
            id = fichas[0].id;
            storage.definirAtiva(id);
        } else {
            id = storage.criarFicha('FICHA LAST PAIGE').id;
            storage.definirAtiva(id);
        }
    }
    ui.fichaId = id;
    salvamento.definirFicha(id);

    const salva = storage.lerFicha(id);
    if (salva) substituirEstado(salva);

    // 2. Carrega os dados (com fallback) e monta as listas fixas
    construirAtributos();
    construirDesespero();

    // Só entram aqui as listas necessárias para a primeira renderização.
    const [listaPericias, listaCondicoes, listaEfeitos] = await Promise.all([
        dados.pericias(),
        dados.condicoes(),
        dados.efeitosDesespero()
    ]);

    ui.dados.pericias = listaPericias;
    ui.dados.condicoes = listaCondicoes;
    ui.dados.efeitosDesespero = listaEfeitos.efeitos || [];
    ui.dados.efeitosAutomaticos = listaEfeitos.automaticos || [];

    // Lazy-load (RF02/RNF02): trilhas e equipamentos só são buscados quando
    // realmente necessários — o autocomplete de trilha, o painel de progresso
    // e o modal de equipamento. Nada trava se o arquivo falhar (há fallback).
    dados.trilhas().then((lista) => {
        ui.dados.trilhas = lista;
        renderTrilha();
    }).catch(() => {});

    // 3. Condições desconhecidas no JSON são descartadas
    const idsValidos = new Set(listaCondicoes.map((c) => c.id));
    Object.keys(estado.condicoes).forEach((idCondicao) => {
        if (!idsValidos.has(idCondicao)) delete estado.condicoes[idCondicao];
    });

    // 4. Primeira renderização
    ficha.aplicarDerivados(estado);
    await sincronizarTrilhaDoEstado();
    construirPericias();
    construirCondicoes();
    renderizar();
    renderEquipamentos();
    renderMaldicoes();
    renderCondicoes();

    // 5. Modo bloqueado e eventos
    ui.bloqueado = contexto.iniciarBloqueado !== false;
    aplicarModoBloqueio();
    registrarEventos();
    registrarAtalhos();
    iniciarMusica();

    // 5.1 Qualquer edição de campo repinta o resto da ficha
    inscrever((motivo) => {
        if (MOTIVOS_REPINTAR.has(motivo)) renderizar();
    });

    // 6. O estado inicial já está salvo no storage
    feedback('pronto · salvamento automático ligado', 'salvo');

    const versao = $('#footer-versao');
    if (versao) versao.textContent = '· formato v' + VERSAO_FICHA;

    // 7. Aviso sobre fetch local (file://)
    if (dados.protocoloDeArquivo) {
        toast('Abrindo por file:// — as listas de data/*.json não carregam. Rode "python3 -m http.server" (veja README.md).', 'aviso', 8000);
    }

    return { fichaId: ui.fichaId, estado };
}
