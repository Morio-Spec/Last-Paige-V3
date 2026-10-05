/* ============================================================
   FICHA LAST PAIGE — js/storage.js
   Persistência no localStorage: várias fichas, uma ativa,
   salvamento automático com debounce e controle de erros.
   ============================================================ */

const PREFIXO = 'lastpaige.';
const CHAVE_INDICE = PREFIXO + 'indice.v2';
const CHAVE_ATIVA = PREFIXO + 'ativa.v2';
const CHAVE_TEMA = PREFIXO + 'tema.v2';
const chaveFicha = (id) => `${PREFIXO}ficha.v2.${id}`;

/* Memória de emergência quando o navegador bloqueia o localStorage
   (modo privado em alguns navegadores). Evita perder a ficha na sessão. */
const memoria = new Map();

/** Testa se o localStorage está realmente utilizável. */
function testarAcesso() {
    try {
        const teste = PREFIXO + 'teste';
        localStorage.setItem(teste, '1');
        localStorage.removeItem(teste);
        return true;
    } catch (_) {
        return false;
    }
}

export const disponivel = testarAcesso();

function lerCru(chave) {
    if (disponivel) return localStorage.getItem(chave);
    return memoria.has(chave) ? memoria.get(chave) : null;
}

function escreverCru(chave, valor) {
    memoria.set(chave, valor);
    if (!disponivel) return false;
    try {
        localStorage.setItem(chave, valor);
        return true;
    } catch (erro) {
        // Cota estourada ou modo privado: seguimos só com a memória.
        console.warn('[storage] não consegui escrever no localStorage:', erro);
        return false;
    }
}

function lerJSON(chave, padrao) {
    const bruto = lerCru(chave);
    if (!bruto) return padrao;
    try {
        return JSON.parse(bruto);
    } catch (erro) {
        console.warn('[storage] JSON inválido em', chave, erro);
        return padrao;
    }
}

/* ============================================================
   ÍNDICE DE FICHAS
   ============================================================ */

/** @returns {Array<{id:string,nome:string,personagem:string,nivel:string,atualizadoEm:string}>} */
export function listarFichas() {
    const lista = lerJSON(CHAVE_INDICE, []);
    return Array.isArray(lista) ? lista : [];
}

function salvarIndice(lista) {
    escreverCru(CHAVE_INDICE, JSON.stringify(lista));
}

/** Cria um identificador único de ficha. */
function novoId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Cria uma ficha vazia e a coloca na lista. */
export function criarFicha(nomeFicha = 'Nova ficha') {
    const ficha = {
        id: novoId(),
        nome: nomeFicha,
        personagem: '',
        nivel: '',
        desespero: 0,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
    };
    const lista = listarFichas();
    lista.unshift(ficha);
    salvarIndice(lista);
    return ficha;
}

/** Atualiza os dados-resumo de uma ficha no índice. */
export function atualizarIndice(id, resumo) {
    const lista = listarFichas();
    const alvo = lista.find((f) => f.id === id);
    if (!alvo) return;
    Object.assign(alvo, resumo, { atualizadoEm: new Date().toISOString() });
    salvarIndice(lista);
}

/** Lê (e desserializa) o conteúdo completo de uma ficha. */
export function lerFicha(id) {
    return lerJSON(chaveFicha(id), null);
}

/** Grava o conteúdo completo de uma ficha. */
export function salvarFicha(id, dados) {
    const ok = escreverCru(chaveFicha(id), JSON.stringify(dados));
    if (ok) {
        atualizarIndice(id, {
            nome: dados.nome || 'Sem título',
            personagem: dados.personagem || '',
            nivel: dados.nivel || '',
            desespero: Number(dados.despero) || 0
        });
    }
    return ok;
}

/** Apaga uma ficha do navegador. */
export function removerFicha(id) {
    memoria.delete(chaveFicha(id));
    if (disponivel) localStorage.removeItem(chaveFicha(id));
    salvarIndice(listarFichas().filter((f) => f.id !== id));
    if (idAtivo() === id) {
        const restantes = listarFichas();
        if (restantes.length) definirAtiva(restantes[0].id);
        else limparAtiva();
    }
}

/* ============================================================
   FICHA ATIVA
   ============================================================ */

export function idAtivo() {
    return lerCru(CHAVE_ATIVA) || null;
}

export function definirAtiva(id) {
    escreverCru(CHAVE_ATIVA, id);
}

export function limparAtiva() {
    memoria.delete(CHAVE_ATIVA);
    if (disponivel) localStorage.removeItem(CHAVE_ATIVA);
}

/* ============================================================
   TEMA
   ============================================================ */

export function lerTema() {
    return lerCru(CHAVE_TEMA) || null;
}

export function salvarTema(tema) {
    escreverCru(CHAVE_TEMA, tema);
}

/* ============================================================
   SALVAMENTO AUTOMÁTICO COM DEBOUNCE
   ============================================================ */

/**
 * Cria um salvador automático.
 * @param {Function} salvarFn recebe o id da ficha e os dados a salvar
 * @param {number} atraso tempo de espera após a última edição (ms)
 */
export function criarAutoSalvar(salvarFn, atraso = 500) {
    let timer = null;
    let idAtual = null;

    function salvarAgora() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (!idAtual) return false;
        return salvarFn(idAtual);
    }

    return {
        /** Liga o auto-save para uma ficha específica. */
        definirFicha(id) {
            idAtual = id;
        },
        /** Agenda o salvamento (reinicia o timer a cada chamada). */
        agendar() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                salvarAgora();
            }, atraso);
        },
        /** Cancela o salvamento pendente. */
        cancelar() {
            if (timer) clearTimeout(timer);
            timer = null;
        },
        salvarAgora,
        get temPendente() {
            return timer !== null;
        }
    };
}