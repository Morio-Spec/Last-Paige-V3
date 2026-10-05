/* ============================================================
   FICHA LAST PAIGE — js/theme.js
   Três temas (Dark Verde, Blood Moon, Vaticano) com troca
   animada, persistência e troca de favicon.
   ============================================================ */

import * as storage from './storage.js';

/** Definição de cada tema. `proximo` deixa o ciclo explícito. */
export const TEMAS = [
    {
        id: 'dark',
        nome: 'Dark Verde',
        icone: 'moon-stars',
        favicon: 'assets/favicon.svg',
        proximo: 'bloodmoon'
    },
    {
        id: 'bloodmoon',
        nome: 'Blood Moon',
        icone: 'droplet-half',
        favicon: 'assets/bloodmoon.svg',
        proximo: 'vaticano'
    },
    {
        id: 'vaticano',
        nome: 'Vaticano',
        icone: 'sun',
        favicon: 'assets/vaticano.svg',
        proximo: 'dark'
    }
];

const ATRIBUTO_TEMA = 'data-theme';
const PREFIXO_BOOTSTRAP = 'data-bs-theme';

/** Mapa id -> tema (com fallback seguro). */
export function porId(id) {
    return TEMAS.find((t) => t.id === id) || TEMAS[0];
}

/**
 * Aplica um tema na página.
 * @param {string} id 'dark' | 'bloodmoon' | 'vaticano'
 * @param {boolean} animar mostra a animação de troca no botão
 */
export function aplicarTema(id, animar = true) {
    const tema = porId(id);
    const raiz = document.documentElement;

    // O atributo fica só no <html>: se fosse também no <body>,
    // o <body> sobrescreveria as variáveis herdadas do <html>.
    raiz.setAttribute(ATRIBUTO_TEMA, tema.id);
    // Mantém os componentes do Bootstrap na mesma escuridão/brilho.
    raiz.setAttribute(PREFIXO_BOOTSTRAP, tema.id === 'vaticano' ? 'light' : 'dark');

    // Favicon acompanha o tema
    const favicon = document.getElementById('favicon');
    if (favicon) favicon.setAttribute('href', tema.favicon);

    // Botão de tema
    const botao = document.getElementById('btn-tema');
    if (botao) {
        const icone = document.getElementById('tema-icone');
        if (icone) icone.className = 'bi bi-' + tema.icone;
        const rotulo = botao.querySelector('.btn-theme__label');
        if (rotulo) rotulo.textContent = tema.nome;
        botao.setAttribute('title', 'Tema: ' + tema.nome + ' (clique para trocar)');
        botao.setAttribute('aria-label', 'Trocar tema (atual: ' + tema.nome + ')');
        if (animar) {
            botao.classList.remove('is-spinning');
            // força reflow para reiniciar a animação
            void botao.offsetWidth;
            botao.classList.add('is-spinning');
            setTimeout(() => botao.classList.remove('is-spinning'), 700);
        }
    }

    storage.salvarTema(tema.id);
    return tema;
}

/** Próximo tema do ciclo (botão do cabeçalho). */
export function proximoTema(atual) {
    return porId(atual).proximo;
}

/** Aplica o tema salvo (ou o primeiro da lista). */
export function iniciarTema() {
    const salvo = storage.lerTema();
    return aplicarTema(salvo || TEMAS[0].id, false);
}