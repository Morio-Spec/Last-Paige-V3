/* ============================================================
   FICHA LAST PAIGE — js/character.js
   Regras de ficha: cálculos derivados, maldições da trilha,
   desespero, rolagens e (de)serialização com validação.
   ============================================================ */

import {
    estado,
    obter,
    definir,
    numero,
    registrarHistorico,
    VERSAO
} from './state.js';

const VERSAO_ATUAL = VERSAO;

/* ------------------------------------------------------------
   Fórmulas (mantidas exatamente como na versão anterior)
   HP = 20 + (Físico - 10) * 5 + Nível * 2
   PA = Energia Amaldiçoada + Nível * 2
   Esquiva = Agilidade   ·   DT Amaldiçoado = Energia Amaldiçoada
   ------------------------------------------------------------ */

const FORMULAS = {
    hpBase: 20,
    hpPorFisico: 5,
    hpPorNivel: 2,
    paPorNivel: 2
};

/** Mapa abreviado de atributo -> chave no estado. */
const ATRIBUTOS = {
    Fis: 'fisico',
    Agi: 'agilidade',
    For: 'forca',
    Car: 'carisma',
    Int: 'inteligencia',
    EP: 'energiaAmaldicoada'
};

/** Calcula (sem aplicar) os valores derivados dos atributos. */
export function calcularDerivados(ficha = estado) {
    const nivel = Math.max(0, numero(ficha.nivel, 1));
    const fisico = numero(ficha.atributos?.fisico, 10);
    const agilidade = numero(ficha.atributos?.agilidade, 10);
    const energia = numero(ficha.atributos?.energiaAmaldicoada, 10);

    const bonusFisico = fisico > 10 ? (fisico - 10) * FORMULAS.hpPorFisico : 0;

    return {
        hpMax: FORMULAS.hpBase + bonusFisico + nivel * FORMULAS.hpPorNivel,
        paMax: energia + nivel * FORMULAS.paPorNivel,
        esquiva: agilidade,
        dt: energia
    };
}

/**
 * Aplica os derivados na ficha.
 * Se o recurso estava cheio, continua cheio (com o novo máximo).
 * Se estava ferido, mantém o valor atual — só limita ao novo máximo.
 */
export function aplicarDerivados(ficha = estado) {
    const d = calcularDerivados(ficha);

    const sincroniza = (recurso, maximo) => {
        const atual = numero(recurso.atual, 0);
        const estavaCheio = atual >= numero(recurso.max, 0);
        recurso.max = maximo;
        recurso.atual = estavaCheio ? maximo : Math.min(atual, maximo);
        if (recurso.atual < 0) recurso.atual = 0;
    };

    sincroniza(ficha.recursos.hp, d.hpMax);
    sincroniza(ficha.recursos.pa, d.paMax);
    ficha.esquiva = d.esquiva;

    return d;
}

/** Recurso ('hp' | 'pa' | 'psi') com valores legíveis. */
export function recurso(nome) {
    const r = estado.recursos[nome] || { atual: 0, max: 0 };
    return { atual: numero(r.atual, 0), max: Math.max(1, numero(r.max, 1)) };
}

/** Aplica dano/cura e registra no histórico reversível. */
export function ajustarRecurso(nome, delta) {
    const r = estado.recursos[nome];
    if (!r) return null;

    const antes = numero(r.atual, 0);
    let depois = antes + delta;

    // Se ultrapassar o máximo, sobe o máximo (comportamento antigo).
    if (depois > numero(r.max, 0)) {
        r.max = depois;
    }
    if (depois < 0) depois = 0;
    r.atual = depois;

    const rotulo = (delta < 0 ? 'Dano em ' : 'Cura em ').toUpperCase() + nome.toUpperCase() +
        ` (${delta > 0 ? '+' : ''}${delta})`;
    registrarHistorico(rotulo, [{ caminho: `recursos.${nome}.atual`, antes, depois }]);

    return { antes, depois, delta };
}

/** Define um recurso exatamente (usado pelo clique na barra). */
export function definirRecurso(nome, valor) {
    const r = estado.recursos[nome];
    if (!r) return null;
    const antes = numero(r.atual, 0);
    const max = Math.max(1, numero(r.max, 1));
    const depois = Math.max(0, Math.min(max, Math.round(valor)));
    r.atual = depois;
    registrarHistorico(`Ajuste manual de ${nome.toUpperCase()}`, [
        { caminho: `recursos.${nome}.atual`, antes, depois }
    ]);
    return { antes, depois };
}

/* ------------------------------------------------------------
   Trilha e maldições
   ------------------------------------------------------------ */

/** Identificador estável de uma maldição vinda da trilha. */
function idMaldicaoTrilha(trilha, maldicao) {
    return 'trilha:' + trilha + ':' + maldicao.nome;
}

/**
 * Sincroniza as maldições automáticas da trilha com o nível atual.
 * Adiciona as desbloqueadas e remove as de nível acima do personagem
 * (só as que vieram da trilha — as criadas à mão nunca são tocadas).
 * @returns {{novas: string[], removidas: string[]}}
 */
export function sincronizarMaldicoesDaTrilha(ficha = estado, trilha) {
    const resultado = { novas: [], removidas: [] };
    const nivel = Math.max(0, numero(ficha.nivel, 1));

    // 1. remove as da trilha que não são mais válidas (ou de outra trilha)
    ficha.maldicoes = ficha.maldicoes.filter((m) => {
        if (m.origem !== 'trilha') return true;
        const mesmaTrilha = trilha && m.trilha === trilha.nome;
        const valida = mesmaTrilha && numero(m.nivel, 0) <= nivel;
        if (!valida) resultado.removidas.push(m.nome);
        return valida;
    });

    // 2. adiciona as liberadas pelo nível
    if (trilha?.maldicoes?.length) {
        const existentes = new Set(ficha.maldicoes.map((m) => m.id));
        trilha.maldicoes.forEach((maldicao) => {
            if (numero(maldicao.nivel, 0) > nivel) return;
            const id = idMaldicaoTrilha(trilha.nome, maldicao);
            if (existentes.has(id)) return;
            ficha.maldicoes.push({
                id,
                nome: maldicao.nome || 'Maldição',
                custo: maldicao.custo || 'Passivo',
                elemento: maldicao.elemento || 'N/A',
                descricao: maldicao.descricao || '',
                origem: 'trilha',
                trilha: trilha.nome,
                nivel: numero(maldicao.nivel, 1),
                ativa: true
            });
            existentes.add(id);
            resultado.novas.push(maldicao.nome || 'Maldição');
        });
    }

    return resultado;
}

/** Progresso da trilha: desbloqueadas / total. */
export function progressoTrilha(trilha, nivel) {
    const total = trilha?.maldicoes?.length || 0;
    if (!total) return { total: 0, liberadas: 0, proxima: null, percentual: 0 };
    const liberadas = trilha.maldicoes.filter((m) => numero(m.nivel, 0) <= nivel).length;
    const proxima = trilha.maldicoes.find((m) => numero(m.nivel, 0) > nivel) || null;
    return {
        total,
        liberadas,
        proxima,
        percentual: Math.round((liberadas / total) * 100)
    };
}

/** Localiza uma trilha pelo nome (busca por dados carregados). */
export function acharTrilha(trilhas, nome) {
    if (!nome) return null;
    return trilhas.find((t) => t.nome === nome) || null;
}

/* ------------------------------------------------------------
   Desespero
   ------------------------------------------------------------ */

/** Faixa de cor (1 verde · 2 amarelo · 3 laranja · 4 vermelho). */
export function faixaDesespero(nivel) {
    if (nivel <= 5) return 1;
    if (nivel <= 9) return 2;
    if (nivel <= 12) return 3;
    return 4;
}

/** Define o nível de desespero e aplica efeitos automáticos. */
export function definirDesespero(nivel, efeitosAutomaticos = []) {
    const alvo = Math.max(0, Math.min(15, Math.round(Number(nivel) || 0)));
    const anterior = numero(estado.despero, 0);
    estado.despero = alvo;

    // Ficha vinda de um JSON antigo pode não ter essa lista.
    if (!Array.isArray(estado.desperoAplicado)) estado.desperoAplicado = [];

    const avisos = [];

    efeitosAutomaticos.forEach((efeito) => {
        const gatilho = numero(efeito.nivel, 0);
        if (gatilho <= anterior) return;                 // já tinha sido aplicado
        if (alvo < gatilho) return;                       // não chegou no nível
        if (estado.desperoAplicado.includes(gatilho)) return;

        estado.desperoAplicado.push(gatilho);

        const insanidade = numero(efeito.insanidade, 0);
        if (insanidade) {
            const antes = numero(estado.insanidade.atual, 0);
            estado.insanidade.atual = antes + insanidade;
            registrarHistorico(`Desespero ${gatilho}: +${insanidade} Insanidade`, [
                { caminho: 'insanidade.atual', antes, depois: estado.insanidade.atual }
            ]);
        }
        avisos.push(efeito.mensagem || `Efeito do desespero ${gatilho} aplicado.`);
    });

    // Desceu de nível: libera os efeitos para poderem ser re-aplicados depois.
    if (alvo < anterior) {
        estado.desperoAplicado = estado.desperoAplicado.filter((n) => n <= alvo);
    }

    return { nivel: alvo, avisos };
}

/* ------------------------------------------------------------
   Rolagens de perícia (1d20 + perícia + atributo)
   ------------------------------------------------------------ */

/** Número aleatório de 1 a 20 (usa crypto quando disponível). */
function rolarD20() {
    if (globalThis.crypto?.getRandomValues) {
        const buffer = new Uint8Array(1);
        crypto.getRandomValues(buffer);
        return (buffer[0] % 20) + 1;
    }
    return Math.floor(Math.random() * 20) + 1;
}

/**
 * Rola uma perícia e registra no histórico.
 * @param {string} nome
 * @param {string} siglaAtributo 'Agi' | 'Fis' | ...
 */
export function rolarPericia(nome, siglaAtributo = '') {
    const valorPericia = numero(obter(`pericias.${nome}`), 0);
    const chaveAtributo = ATRIBUTOS[siglaAtributo];
    const bonusAtributo = chaveAtributo ? numero(estado.atributos[chaveAtributo], 0) : 0;

    const d20 = rolarD20();
    const total = d20 + valorPericia + bonusAtributo;

    const rolagem = {
        pericia: nome,
        d20,
        valorPericia,
        atributo: siglaAtributo,
        bonus: bonusAtributo,
        total,
        critico: d20 === 20,
        falha: d20 === 1,
        em: new Date().toISOString()
    };

    estado.rolagens.unshift(rolagem);
    if (estado.rolagens.length > 30) estado.rolagens.length = 30;

    return rolagem;
}

/* ------------------------------------------------------------
   Serialização / validação
   ------------------------------------------------------------ */

const CHAVES_TEXTO = [
    'nome', 'jogador', 'personagem', 'idade', 'origem', 'nivel', 'xp', 'aparencia', 'notas'
];

/** Prepara a ficha para virar arquivo JSON exportado. */
export function serializar(ficha = estado) {
    return {
        _formato: 'ficha-last-paige',
        _versao: VERSAO_ATUAL,
        _exportadoEm: new Date().toISOString(),
        ficha: ficha
    };
}

/**
 * Lê um JSON (novo ou antigo formato) e devolve a ficha + avisos.
 * @returns {{ficha:object, avisos:string[], formato:string}}
 */
export function desserializar(dados) {
    const avisos = [];

    if (!dados || typeof dados !== 'object') {
        return { ficha: criarVazia(), avisos: ['Arquivo inválido: não é um objeto JSON.'], formato: 'invalido' };
    }

    // Formato novo: { ficha: {...} }
    if (dados.ficha && typeof dados.ficha === 'object') {
        return { ficha: normalizar(dados.ficha, avisos), avisos, formato: 'novo' };
    }

    // Formato antigo (exportado pela versão anterior do site)
    if (dados.basicInfo || dados.attributes || dados.status) {
        return { ficha: converterFormatoAntigo(dados, avisos), avisos, formato: 'antigo' };
    }

    return { ficha: criarVazia(), avisos: ['Não reconheci o formato do arquivo.'], formato: 'desconhecido' };
}

function criarVazia() {
    return {
        versao: VERSAO_ATUAL,
        nome: 'FICHA LAST PAIGE',
        jogador: '', personagem: '', idade: '-', origem: '-', nivel: '1', xp: '0/20',
        aparencia: '', notas: '', trilha: { nome: '', resumo: '' },
        atributos: {
            fisico: 10, agilidade: 10, forca: 10, carisma: 10, inteligencia: 10, energiaAmaldicoada: 10
        },
        recursos: { hp: { atual: 22, max: 22 }, pa: { atual: 12, max: 12 }, psi: { atual: 40, max: 40 } },
        insanidade: { atual: 0, max: '????' },
        esquiva: 10, desespero: 0, desesperoAplicado: [],
        pericias: {}, equipamentos: [], maldicoes: [], condicoes: {}, rolagens: [], historico: []
    };
}

/** Completa campos faltantes e garante os tipos certos. */
function normalizar(entrada, avisos = []) {
    const ficha = criarVazia();
    const fonte = entrada || {};

    CHAVES_TEXTO.forEach((chave) => {
        if (typeof fonte[chave] === 'string') {
            ficha[chave] = fonte[chave];
        } else if (fonte[chave] != null) {
            avisos.push(`Campo "${chave}" não era texto; foi convertido.`);
            ficha[chave] = String(fonte[chave]);
        } else {
            avisos.push(`Campo "${chave}" ausente no arquivo.`);
        }
    });

    ficha.versao = numero(fonte.versao, VERSAO_ATUAL) || VERSAO_ATUAL;

    // Trilha
    if (typeof fonte.trilha === 'string') {
        ficha.trilha = { nome: fonte.trilha, resumo: '' };
    } else if (fonte.trilha && typeof fonte.trilha === 'object') {
        ficha.trilha = { nome: fonte.trilha.nome || '', resumo: fonte.trilha.resumo || '' };
    }

    // Atributos
    const attrs = fonte.atributos && typeof fonte.atributos === 'object' ? fonte.atributos : {};
    Object.entries(ATRIBUTOS).forEach(([, chave]) => {
        if (attrs[chave] != null) ficha.atributos[chave] = numero(attrs[chave], 10);
        else avisos.push(`Atributo "${chave}" ausente (assumi 10).`);
    });

    // Recursos
    const rec = fonte.recursos && typeof fonte.recursos === 'object' ? fonte.recursos : {};
    ['hp', 'pa', 'psi'].forEach((nome) => {
        if (rec[nome] && typeof rec[nome] === 'object') {
            ficha.recursos[nome].atual = numero(rec[nome].atual, 0);
            ficha.recursos[nome].max = Math.max(1, numero(rec[nome].max, 1));
        } else {
            avisos.push(`Recurso "${nome}" ausente.`);
        }
    });

    if (fonte.insanidade && typeof fonte.insanidade === 'object') {
        ficha.insanidade.atual = numero(fonte.insanidade.atual, 0);
        ficha.insanidade.max = fonte.insanidade.max ?? '????';
    }

    ficha.esquiva = numero(fonte.esquiva, 10);
    ficha.despero = Math.max(0, Math.min(15, numero(fonte.despero, 0)));
    ficha.desperoAplicado = Array.isArray(fonte.desperoAplicado) ? fonte.desperoAplicado.map(Number) : [];

    // Perícias
    if (fonte.pericias && typeof fonte.pericias === 'object') {
        ficha.pericias = Object.fromEntries(
            Object.entries(fonte.pericias).map(([k, v]) => [k, numero(v, 0)])
        );
    }

    // Listas
    if (Array.isArray(fonte.equipamentos)) {
        ficha.equipamentos = fonte.equipamentos.map((item, i) => ({
            id: item.id || `eq${Date.now()}${i}`,
            nome: item.nome || item.name || 'Equipamento',
            descricao: item.descricao ?? item.dano ?? item.damage ?? '',
            quantidade: Math.max(1, numero(item.quantidade ?? item.quantidade ?? 1, 1)),
            peso: Math.max(0, numero(item.peso, 1)),
            notas: item.notas || ''
        }));
    }

    if (Array.isArray(fonte.maldicoes)) {
        ficha.maldicoes = fonte.maldicoes.map((m, i) => ({
            id: m.id || `mal${Date.now()}${i}`,
            nome: m.nome || m.name || 'Maldição',
            custo: m.custo ?? m.cost ?? 'Passivo',
            elemento: m.elemento ?? m.element ?? 'N/A',
            descricao: m.descricao ?? m.description ?? '',
            origem: m.origem || 'propria',
            trilha: m.trilha || '',
            nivel: numero(m.nivel ?? m.level, 0),
            ativa: m.ativa !== false
        }));
    }

    if (fonte.condicoes && typeof fonte.condicoes === 'object') {
        ficha.condicoes = Object.fromEntries(
            Object.entries(fonte.condicoes).map(([k, v]) => [k, Boolean(v)])
        );
    }

    if (Array.isArray(fonte.rolagens)) {
        ficha.rolagens = fonte.rolagens.slice(0, 30);
    }

    return ficha;
}

/** Converte o JSON exportado pela versão antiga do site. */
function converterFormatoAntigo(antigo, avisos) {
    const b = antigo.basicInfo || {};
    const a = antigo.attributes || {};
    const s = antigo.status || {};

    const ficha = criarVazia();

    ficha.nome = b.name || 'FICHA LAST PAIGE';
    ficha.jogador = b.player ?? '';
    ficha.personagem = b.name ?? '';
    ficha.idade = b.age ?? '-';
    ficha.origem = b.origin ?? '-';
    ficha.trilha = { nome: b.path || '', resumo: '' };
    ficha.nivel = String(b.level ?? '1');
    ficha.xp = b.xp ?? '0/20';
    ficha.aparencia = b.appearance ?? '';

    ficha.atributos = {
        fisico: numero(a.physical, 10),
        agilidade: numero(a.agility, 10),
        forca: numero(a.strength, 10),
        carisma: numero(a.charisma, 10),
        inteligencia: numero(a.intelligence, 10),
        energiaAmaldicoada: numero(a.cursedEnergy, 10)
    };

    if (s.hp) ficha.recursos.hp = { atual: numero(s.hp.current, 20), max: numero(s.hp.max, 20) };
    if (s.pa) ficha.recursos.pa = { atual: numero(s.pa.current, 10), max: numero(s.pa.max, 10) };
    if (s.psy) ficha.recursos.psi = { atual: numero(s.psy.current, 40), max: numero(s.psy.max, 40) };
    ficha.insanidade.atual = numero(s.insanity, 0);
    ficha.esquiva = numero(s.dodge, 10);

    if (Array.isArray(antigo.skills)) {
        antigo.skills.forEach((pericia) => {
            if (pericia?.name) ficha.pericias[pericia.name] = numero(pericia.value, 0);
        });
    } else {
        avisos.push('O arquivo antigo não tinha lista de perícias.');
    }

    if (Array.isArray(antigo.equipment)) {
        ficha.equipamentos = antigo.equipment.map((item, i) => ({
            id: 'eq' + i,
            nome: item?.name || 'Equipamento',
            descricao: item?.damage || '',
            quantidade: 1,
            peso: 1,
            notas: ''
        }));
    }

    if (Array.isArray(antigo.curses)) {
        ficha.maldicoes = antigo.curses.map((m, i) => ({
            id: 'mal' + i,
            nome: m?.name || 'Maldição',
            custo: String(m?.cost ?? '1'),
            elemento: m?.element || '',
            descricao: m?.description || '',
            origem: 'propria',
            trilha: '',
            nivel: 0,
            ativa: true
        }));
    }

    avisos.push('Importado no formato antigo (v1) — alguns campos novos ficaram vazios.');
    return ficha;
}