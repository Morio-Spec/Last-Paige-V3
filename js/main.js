/* ============================================================
   FICHA LAST PAIGE — js/main.js
   Orquestração: inicia o tema, carrega a ficha salva,
   monta a interface e conecta o indicador de "salvo".
   ============================================================ */

import * as tema from './theme.js';
import * as storage from './storage.js';
import { inscrever, aoSalvar, salvamento } from './state.js';
import { iniciarUI } from './ui.js';

/* ------------------------------------------------------------
   1. Tema antes de tudo (evita "flash" de cor errada)
   ------------------------------------------------------------ */
tema.iniciarTema();

/* ------------------------------------------------------------
   2. Aviso amigável quando o navegador bloqueia o salvamento
   ------------------------------------------------------------ */
if (!storage.disponivel) {
    console.warn('[last-paige] localStorage indisponível: a ficha só valerá nesta aba.');
}

/* ------------------------------------------------------------
   3. Indicador "salvando… → salvo ✓" no cabeçalho
   ------------------------------------------------------------ */
const elementoFeedback = () => document.getElementById('save-feedback');
const textoFeedback = () => document.getElementById('save-feedback-text');

function mostrarFeedback(texto, status) {
    const elemento = elementoFeedback();
    const alvo = textoFeedback();
    if (!elemento || !alvo) return;
    elemento.dataset.status = status;
    alvo.textContent = texto;
    const iconeEl = elemento.querySelector('i');
    if (iconeEl) {
        const nomeIcone =
            status === 'salvo' ? 'check-circle' :
            status === 'salvando' ? 'arrow-repeat' :
            status === 'erro' ? 'exclamation-triangle' : 'cloud';
        iconeEl.className = 'bi bi-' + nomeIcone;
    }
}

// Enquanto o jogador digita, mostra "salvando…"
inscrever(() => {
    const elemento = elementoFeedback();
    if (elemento?.dataset.status === 'salvo' && elemento.dataset.travado === 'true') return;
    mostrarFeedback('salvando…', 'salvando');
});

// Quando o auto-save grava de fato, mostra o horário
aoSalvar((ok) => {
    if (!ok) {
        mostrarFeedback('falha ao salvar', 'erro');
        return;
    }
    const hora = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    mostrarFeedback(`salvo ✓ ${hora}`, 'salvo');
});

/* ------------------------------------------------------------
   4. Sobe a interface
   ------------------------------------------------------------ */
(async function iniciar() {
    try {
        await iniciarUI({ iniciarBloqueado: true });
    } catch (erro) {
        console.error('[last-paige] falha ao iniciar:', erro);
        console.error(erro);
        window.alert(
            'Algo quebrou ao carregar a ficha.\n' +
            'Abra o console (F12) para ver o detalhe.\n\n' +
            (erro?.message || erro)
        );
    }
})();

/* ------------------------------------------------------------
   5. Garante o último save ao fechar a aba
   ------------------------------------------------------------ */
window.addEventListener('beforeunload', () => salvamento.salvarAgora());
window.addEventListener('pagehide', () => salvamento.salvarAgora());