/* ============================================================
   FICHA LAST PAIGE — js/data-loader.js
   Carrega os arquivos de data/*.json de forma assíncrona e
   preguiçosa (lazy): só busca a lista quando ela é realmente
   necessária (modal aberto, campo focado, etc.).
   ============================================================ */

/** Mapa de chave -> arquivo. Adicione novos arquivos aqui. */
const ARQUIVOS = {
    trilhas: 'data/trilhas.json',
    equipamentos: 'data/equipamentos.json',
    desespero: 'data/efeitos-desespero.json',
    condicoes: 'data/condicoes.json',
    pericias: 'data/pericias.json'
};

/* ------------------------------------------------------------
   FALLBACKS
   Usados quando o fetch falha (ex.: abrindo o index.html direto
   do disco com file://, onde o navegador bloqueia fetch local).
   As regras do RPG continuam funcionando; apenas as listas
   extensas (trilhas e equipamentos) vêm vazias.
   ------------------------------------------------------------ */
const FALLBACK = {
    desespero: {
        efeitos: [
            { nivel: 1, nome: 'Primeiro Sussurro', descricao: '1d6 psi' },
            { nivel: 2, nome: 'Voz na Parede', descricao: '2d6 psi' },
            { nivel: 3, nome: 'Lábios no escuro', descricao: '3d6 psi' },
            { nivel: 4, nome: 'Sussurros que sobem', descricao: '4d6 psi' },
            { nivel: 5, nome: 'A fissura se abre', descricao: '5d6 psi' },
            { nivel: 6, nome: 'Adrenalina Amaldiçoada', descricao: 'Desesperado — -2 em Intelecto, Carisma e Energia Amaldiçoada; +1 em Físico, Força e Agilidade (adrenalina).' },
            { nivel: 7, nome: 'Sangue nos ouvidos', descricao: '5d6 psiquê' },
            { nivel: 8, nome: 'O dado decide', descricao: 'Ataque de desespero: escolha um número no 1d6 para cada ser presente na cena. O número que cair será atacado. Depois disso: condição desesperado.' },
            { nivel: 9, nome: 'Coral na garganta', descricao: '5d6 psiquê' },
            { nivel: 10, nome: 'Tremor nas mãos', descricao: 'Tremer: -5 em Agilidade (sem vantagens da adrenalina).' },
            { nivel: 11, nome: 'Gritaria abafada', descricao: '6d6 psiquê' },
            { nivel: 12, nome: 'Medo Oldado', descricao: 'Você não consegue atacar nesta cena — só quer fugir ou se esconder. +adrenalina.' },
            { nivel: 13, nome: 'Rugido interno', descricao: '7d7 psiquê' },
            { nivel: 14, nome: 'Terror absoluto', descricao: 'Aterrorizado.' },
            { nivel: 15, nome: 'A última ficha', descricao: '1d6 INSANIDADE' }
        ],
        efeitosAutomaticos: [
            { nivel: 15, insanidade: 1, mensagem: '+1 de Insanidade — você tocou o fundo do poço.' }
        ]
    },

    pericias: {
        pericias: [
            ['Combate', 'Pontaria', 'Agi'], ['Combate', 'Fortitude', 'Fis'],
            ['Combate', 'Luta', 'For'], ['Combate', 'Investigação', 'Int'],
            ['Combate', 'Percepção', 'Int'],
            ['Social', 'Intuição', 'Int'], ['Social', 'Intimidação', 'Car'],
            ['Social', 'Enganação', 'Car'], ['Social', 'Diplomacia', 'Car'],
            ['Social', 'Pilotagem', 'Agi'],
            ['Técnica', 'Tecnologias', 'Int'], ['Técnica', 'Instabilidade', 'Fis'],
            ['Técnica', 'Medicina', 'Int'], ['Técnica', 'Paranormal', 'EP'],
            ['Técnica', 'Acrobacia', 'Agi'],
            ['Sobrevivência', 'História', 'Int'], ['Sobrevivência', 'Linguagens', 'Int'],
            ['Sobrevivência', 'Vontade', 'Int'], ['Sobrevivência', 'Furtividade', 'Agi'],
            ['Sobrevivência', 'Sobrevivência', 'Int'], ['Sobrevivência', 'Atletismo', 'Agi'],
            ['Sobrevivência', 'Ofício', 'Int'], ['Sobrevivência', 'Iniciativa', 'Agi'],
            ['Sobrevivência', 'Reparos', 'Int']
        ].map(([grupo, nome, atributo]) => ({ grupo, nome, atributo }))
    },

    condicoes: {
        condicoes: [
            ['sangrando', 'Sangrando', '#ff3333', '1d8 por rodada. Teste Medicina DT 15 para estancar.'],
            ['cansado', 'Cansado', '#a0a0a0', '-2 em testes. Precisa de descanso médio.'],
            ['atordoado', 'Atordoado', '#ff9900', 'Após 2 críticos, teste Instabilidade DT 15. +1 acerto contra você por 1 rodada.'],
            ['enjoado', 'Enjoado', '#8a2be2', 'Apenas 1 ação (mover ou atacar). Dura 1 cena.'],
            ['morrendo', 'Morrendo', '#000000', 'Teste Físico DT 10 (+2/rodada). Kit médico necessário para salvar.'],
            ['aterrorizado', 'Aterrorizado', '#800080', '-2 testes. Rola 1d20: até 10 paralisado, senão foge. Diplomacia ou Vontade DT 15 ajuda.'],
            ['perturbado', 'Perturbado', '#9370db', 'Teste Vontade DT 15. Ímpar: ilusão. Par: ignora. Ex.: atacar ou investigar algo que não existe.'],
            ['envenenado', 'Envenenado', '#32cd32', '1d6 por rodada e -2 em Agilidade, dura uma cena mesmo após recuperação. Requer antídoto do kit médico DT 15.'],
            ['em-chamas', 'Em Chamas', '#ff8c00', '2d6 por rodada. Apaga com água ou Atletismo DT 10.'],
            ['afogando', 'Afogando', '#1e90ff', 'Dano 1d8 por rodada após turnos = Físico e -2 em teste de ataque enquanto nesse estado. Precisa sair da água.'],
            ['congelado', 'Congelado', '#00bfff', 'Dano 1d6 por rodada após turnos = Físico. Precisa sair da água.'],
            ['congelado-combate', 'Congelado (Combate)', '#00bfff', 'Ao ser atingido por gelo, teste Instabilidade. Falha: congelado (+1 ataque contra você).'],
            ['hipotermia', 'Hipotermia', '#add8e6', 'Tempo no frio = Físico em turnos. Falha: 8d6/turno. Requer fonte de calor e teste Instabilidade DT 15.']
        ].map(([id, nome, cor, descricao]) => ({ id, nome, cor, descricao }))
    },

    trilhas: { trilhas: [] },
    equipamentos: { equipamentos: [] }
};

/* ------------------------------------------------------------ */

const cache = new Map();          // chave -> dados já carregados
const pendentes = new Map();       // chave -> Promise (evita fetch duplicado)
const avisos = new Map();          // chave -> mensagem de erro do fetch

/** Verdadeiro quando a página foi aberta via file:// (fetch local bloqueado). */
export const protocoloDeArquivo = location.protocol === 'file:';

/**
 * Carrega (uma única vez) os dados de um arquivo JSON.
 * @param {keyof typeof ARQUIVOS} chave
 * @returns {Promise<object>}
 */
function carregar(chave) {
    if (cache.has(chave)) return Promise.resolve(cache.get(chave));
    if (pendentes.has(chave)) return pendentes.get(chave);

    const arquivo = ARQUIVOS[chave];
    if (!arquivo) return Promise.reject(new Error('chave de dados desconhecida: ' + chave));

    const promessa = fetch(arquivo, { cache: 'no-cache' })
        .then((resposta) => {
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            return resposta.json();
        })
        .then((dados) => {
            cache.set(chave, dados);
            pendentes.delete(chave);
            return dados;
        })
        .catch((erro) => {
            pendentes.delete(chave);
            avisos.set(chave, erro.message);
            // Fallback silencioso: a ficha continua funcionando.
            const reserva = FALLBACK[chave] || {};
            cache.set(chave, reserva);
            return reserva;
        });

    pendentes.set(chave, promessa);
    return promessa;
}

/* ------------------------------------------------------------
   Acessadores com validação — usados pelo resto do app
   ------------------------------------------------------------ */

export async function trilhas() {
    const dados = await carregar('trilhas');
    return Array.isArray(dados.trilhas) ? dados.trilhas : [];
}

export async function equipamentos() {
    const dados = await carregar('equipamentos');
    return Array.isArray(dados.equipamentos) ? dados.equipamentos : [];
}

export async function efeitosDesespero() {
    const dados = await carregar('desespero');
    return {
        efeitos: Array.isArray(dados.efeitos) ? dados.efeitos : [],
        automaticos: Array.isArray(dados.efeitosAutomaticos) ? dados.efeitosAutomaticos : []
    };
}

export async function condicoes() {
    const dados = await carregar('condicoes');
    return Array.isArray(dados.condicoes) ? dados.condicoes : [];
}

export async function pericias() {
    const dados = await carregar('pericias');
    return Array.isArray(dados.pericias) ? dados.pericias : [];
}