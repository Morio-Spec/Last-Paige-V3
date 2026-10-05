/* ============================================================
   FICHA LAST PAIGE — js/state.js
   Objeto de estado único da ficha (fonte da verdade).
   Nada de variáveis soltas pelo código: tudo mora aqui e as
   alterações passam por definir() para que a tela e o
   salvamento automático saibam que algo mudou.
   ============================================================ */

import * as storage from './storage.js';

/** Versão do formato salvo — aumentar ao mudar a estrutura. */
export const VERSAO = 2;

/* ------------------------------------------------------------
   Criadores
   ------------------------------------------------------------ */

/** Ficha em branco, com os mesmos valores padrão da versão antiga. */
export function criarEstadoInicial() {
    return {
        versao: VERSAO,
        nome: 'FICHA LAST PAIGE',
        jogador: 'Nome do Jogador',
        personagem: 'Nome do Personagem',
        idade: '-',
        origem: '-',
        nivel: '1',
        xp: '0/20',
        aparencia: 'Descreva a aparência do personagem aqui.',
        notas: '',

        trilha: { nome: '', resumo: '' },

        atributos: {
            fisico: 10,
            agilidade: 10,
            forca: 10,
            carisma: 10,
            inteligencia: 10,
            energiaAmaldicoada: 10
        },

        recursos: {
            hp: { atual: 22, max: 22 },
            pa: { atual: 12, max: 12 },
            psi: { atual: 40, max: 40 }
        },

        insanidade: { atual: 0, max: '????' },
        esquiva: 10,
        desespero: 0,
        desesperoAplicado: [],
        desperoOverrides: {},

        pericias: {},
        equipamentos: [],
        maldicoes: [],
        condicoes: {},

        rolagens: [],
        historico: []
    };
}

/** Estado atualmente em edição (a ficha aberta). */
export let estado = criarEstadoInicial();

/** Substitui o estado atual (ao carregar/importar uma ficha). */
export function substituirEstado(novo) {
    estado = novo;
    estado.pericias = estado.pericias || {};
    estado.condicoes = estado.condicoes || {};
    estado.equipamentos = Array.isArray(estado.equipamentos) ? estado.equipamentos : [];
    estado.maldicoes = Array.isArray(estado.maldicoes) ? estado.maldicoes : [];
    estado.rolagens = Array.isArray(estado.rolagens) ? estado.rolagens : [];
    estado.historico = Array.isArray(estado.historico) ? estado.historico : [];
    estado.desperoAplicado = Array.isArray(estado.desperoAplicado) ? estado.desperoAplicado : [];
    estado.desesperoOverrides = estado.desesperoOverrides || {};
    return estado;
}

/** Cópia profunda simples (JSON) para salvar/exportar. */
export function clonar(objeto) {
    return JSON.parse(JSON.stringify(objeto));
}

/* ------------------------------------------------------------
   Leitura e escrita por caminho ("recursos.hp.atual")
   ------------------------------------------------------------ */

/** Lê um valor por caminho. */
export function obter(caminho) {
    return caminho.split('.').reduce((obj, parte) => (obj == null ? undefined : obj[parte]), estado);
}

/** Define um valor por caminho (cria os níveis intermediários). */
export function definir(caminho, valor) {
    const partes = caminho.split('.');
    const ultima = partes.pop();
    const alvo = partes.reduce((obj, parte) => {
        if (typeof obj[parte] !== 'object' || obj[parte] === null) obj[parte] = {};
        return obj[parte];
    }, estado);
    alvo[ultima] = valor;
    return alvo[ultima];
}

/** Converte para número com valor padrão seguro. */
export function numero(valor, padrao = 0) {
    const n = Number.parseInt(String(valor ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : padrao;
}

/* ------------------------------------------------------------
   Notificações de mudança
   ------------------------------------------------------------ */

const ouvintes = new Set();

/** Registra uma função a ser chamada sempre que o estado muda. */
export function inscrever(funcao) {
    ouvintes.add(funcao);
    return () => ouvintes.delete(funcao);
}

/** Avisa todos os ouvintes que houve alteração. */
function notificar(motivo = 'mudanca') {
    ouvintes.forEach((funcao) => {
        try {
            funcao(motivo);
        } catch (erro) {
            console.error('[state] ouvinte falhou:', erro);
        }
    });
}

/* ------------------------------------------------------------
   Histórico reversível (dano / cura / curas automáticas)
   ------------------------------------------------------------ */

const LIMITE_HISTORICO = 40;

/**
 * Registra um conjunto de mudanças para poder desfazer depois.
 * @param {string} rotulo texto mostrado para o jogador
 * @param {Array<{caminho:string, antes:*, depois:*}>} mudancas
 */
export function registrarHistorico(rotulo, mudancas) {
    const validas = mudancas.filter((m) => m.caminho);
    if (!validas.length) return;
    estado.historico.push({
        id: Date.now() + Math.random().toString(36).slice(2, 6),
        rotulo,
        em: new Date().toISOString(),
        mudancas: validas
    });
    if (estado.historico.length > LIMITE_HISTORICO) {
        estado.historico.splice(0, estado.historico.length - LIMITE_HISTORICO);
    }
}

/**
 * Desfaz a última alteração registrada.
 * @returns {string|null} rótulo do que foi desfeito
 */
export function desfazer() {
    const ultimo = estado.historico.pop();
    if (!ultimo) return null;

    const inversas = ultimo.mudancas.map((m) => ({
        caminho: m.caminho,
        antes: m.depois,
        depois: m.antes
    }));

    inversas.forEach((m) => definir(m.caminho, m.depois));
    // A própria ação de desfazer fica registrada (permite refazer).
    estado.historico.push({
        id: ultimo.id + 'x',
        rotulo: 'desfeito: ' + ultimo.rotulo,
        em: new Date().toISOString(),
        mudancas: inversas
    });
    return ultimo.rotulo;
}

/* ------------------------------------------------------------
   Atalhos de leitura usados com frequência
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   Auto-save: um único ponto de integração com o storage
   ------------------------------------------------------------ */

/* Lista de funções avisadas depois de cada gravação bem-sucedida. */
const ouvintesSalvar = new Set();

/**
 * Registra um callback para ser chamado após cada salvamento.
 * @param {Function(ok:boolean)} funcao
 */
export function aoSalvar(funcao) {
    ouvintesSalvar.add(funcao);
    return () => ouvintesSalvar.delete(funcao);
}

const autoSalvar = storage.criarAutoSalvar((id) => {
    const ok = storage.salvarFicha(id, clonar(estado));
    ouvintesSalvar.forEach((funcao) => {
        try {
            funcao(ok);
        } catch (erro) {
            console.error('[state] callback de salvamento falhou:', erro);
        }
    });
    return ok;
}, 500);

export const salvamento = autoSalvar;

/** Agenda o salvamento automático e avisa a UI que algo mudou. */
export function alterado(motivo = 'mudanca', agendandoSalvar = true) {
    if (agendandoSalvar) autoSalvar.agendar();
    notificar(motivo);
}