# •X• FICHA LAST PAIGE •X•

Ficha de personagem web para RPG de mesa sobrenatural (dark / paranormal / amaldiçoado).
HTML + CSS + JavaScript **vanilla** com Bootstrap 5, sem jQuery e sem build.

Tudo é salvo **sozinho** no navegador. Feche, abra outro dia, a ficha está igual.

---

## 🚀 Como abrir

### Opção 1 — servidor local (recomendado)

O site usa `fetch()` para ler os arquivos de `data/`. Abra-lo com duplo clique
(`file://`) faz o navegador **bloquear** a leitura desses JSONs, então use um servidor
local simples. Não precisa instalar nada além do Python (ou Node):

```bash
# dentro da pasta do projeto
python3 -m http.server 8000

# ou, se tiver Node instalado
npx serve .
```

Depois abra **http://localhost:8000**.

> Abrindo por `file://` a ficha continua funcionando, mas as listas de
> trilhas/equipamentos/perícias não carregam (o app mostra um aviso explicando isso).

### Opção 2 — abrir o `index.html` direto

Funciona para tudo **menos** o carregamento de `data/*.json`. As regras fixas
(perícias, condições, desespero) têm uma cópia de reserva embutida no
`js/data-loader.js`, então nada quebra.

---

## ⌨️ Atalhos de teclado

| Atalho | O que faz |
|---|---|
| `Ctrl` + `E` | Alterna **Editar / Bloquear** a ficha |
| `Ctrl` + `S` | Salva na hora (e mostra “salvo ✓ hh:mm:ss”) |
| `Ctrl` + `P` | Exporta em **PDF** (abre a janela de impressão) |
| `Ctrl` + `Z` | **Desfaz** a última alteração de HP/PA/Psiquê |
| `Esc` | Fecha os autocompletes abertos |
| `Tab` | Navega por todos os campos editáveis e botões |
| Setas / `Home` / `End` | Ajustam a barra de recurso que estiver focada |

> `Ctrl+S` e `Ctrl+P` são interceptados para não abrirem o diálogo do navegador.

---

## 🎯 Regras que o site calcula

| Valor | Fórmula |
|---|---|
| **HP máximo** | `20 + (Físico − 10) × 5 + Nível × 2` |
| **PA máximo** | `Energia Amaldiçoada + Nível × 2` |
| **Esquiva** | `Agilidade` |
| **DT Amaldiçoado** | `Energia Amaldiçoada` |
| **Rolagem de perícia** | `1d20 + valor da perícia + atributo` (20 = crítico, 1 = falha crítica) |

O recálculo acontece sozinho ao mudar **nível** ou **atributos**.
Se o recurso estava cheio, ele continua cheio com o novo máximo;
se estava ferido, o valor atual é mantido (só limitado ao novo máximo).

**Desespero**: 15 caixas com tooltip. As cores sobem de forma progressiva
(verde → amarelo → laranja → vermelho). Ao chegar no nível 15 o site aplica
**+1 de Insanidade** automaticamente e avisa com um toast. A descrição do
efeito pode ser editada dentro da própria ficha (botão *editar*) ou no
`data/efeitos-desespero.json` (esse é o texto padrão).

---

## 🗂 Onde ficam os dados (para você editar sem mexer em código)

Todos os arquivos em `data/` são **JSON puro** — abre no Bloco de Notas e pronto.
O topo de cada arquivo tem um bloco `_README` explicando o formato.

| Arquivo | Contém |
|---|---|
| `data/trilhas.json` | Trilhas (caminhos) e as maldições que cada uma libera por nível |
| `data/equipamentos.json` | Lista de equipamentos/armas com dano, categoria e peso |
| `data/efeitos-desespero.json` | Texto dos 15 níveis de desespero + efeitos automáticos |
| `data/condicoes.json` | As 13 condições e suas regras |
| `data/pericias.json` | As 24 perícias, agrupadas e com o atributo usado |

### Adicionar uma trilha nova

1. Abra `data/trilhas.json`.
2. Copie um bloco inteiro `{ ... }` de dentro de `"trilhas"`.
3. Troque `"nome"`, `"resumo"` e a lista `"maldicoes"` (cada maldição tem
   `"nivel"` = nível do personagem que libera).
4. Salve e **recarregue a página** (`Ctrl+R`).

A trilha nova aparece imediatamente no autocomplete do campo *Trilha*,
**sem tocar em nenhum `.js`**.

### Adicionar um equipamento novo

Mesmo processo em `data/equipamentos.json`: copie um bloco, troque `id`, `nome`,
`categoria`, `dano` e `peso`. Ele aparece no autocomplete do modal *Equipamento*.

### Onde o site guarda a ficha

No `localStorage` do navegador (não vai para nenhum servidor):

| Chave | Conteúdo |
|---|---|
| `lastpaige.indice.v2` | Lista de fichas salvas (nome, personagem, nível, data) |
| `lastpaige.ficha.v2.<id>` | Conteúdo completo de uma ficha |
| `lastpaige.ativa.v2` | ID da ficha aberta |
| `lastpaige.tema.v2` | Tema escolhido |

O botão **Fichas** (no cabeçalho) abre o gerenciador: criar, abrir e apagar fichas.
Cada personagem/grupo pode ter a sua.

---

## 🖨 Exportar

- **JSON** — arquivo `.json` com tudo (reimportável em qualquer navegador).
  Aceita também os arquivos exportados pela **versão antiga** do site
  (converte automaticamente e avisa o que ficou faltando).
- **PDF** — usa `window.print()` com uma folha de estilo de impressão própria
  (`css/print.css`): sai em fundo claro, sem botões, com as 15 caixas de
  desespero em linha e as listas quebrando direito entre páginas.
  Escolha “Salvar como PDF” na janela de impressão.
- **PNG** — carrega o `html2canvas` sob demanda (precisa de internet na primeira vez).
  Se não conseguir, o site avisa e sugere o PDF.

Dica: exporte um JSON no fim de cada sessão. É o seu backup.

---

## 🎨 Temas

Três temas, alternados pelo botão do cabeçalho (o ícone gira na troca):

1. **Dark Verde** — o clássico.
2. **Blood Moon** — vermelhos profundos.
3. **Vaticano** — dourado e branco, com cara de pergaminho.

O tema escolhido fica salvo e volta quando você reabre a página.

---

## ♿ Acessibilidade

- Todo botão só com ícone tem `aria-label` e `title`.
- Todo campo editável é alcançável por `Tab`, com `role="textbox"` e `aria-label`.
- Foco sempre visível (contorno de 2px na cor do tema).
- As barras de HP/PA/Psiquê funcionam como *sliders*: clique para ajustar,
  setas para mudar de 1 em 1, `Shift`+setas de 5 em 5, `Home`/`End` para 0 e máximo.
- `prefers-reduced-motion: reduce` desliga as runas flutuantes e todas as animações.
- Link “pular para o painel de combate” no topo da página.
- Testado em **360px** de largura sem barra horizontal.

---

## 📁 Estrutura do projeto

```
/
├── index.html               página (estrutura + modais)
├── css/
│   ├── style.css            reset, tipografia, temas, runas de fundo
│   ├── components.css       cards rúnicos, botões, campos, listas, toasts
│   └── print.css            folha de impressão (PDF)
├── js/
│   ├── main.js              orquestração (tema → ficha → interface)
│   ├── storage.js           localStorage: várias fichas, debounce, fallback
│   ├── data-loader.js       fetch dos JSONs + listas de reserva
│   ├── state.js             estado único da ficha + histórico reversível
│   ├── character.js         fórmulas, maldições da trilha, rolagens, JSON
│   ├── ui.js                renderização, eventos, modais, atalhos
│   └── theme.js             troca e persistência de tema
├── data/                    os 5 JSONs editáveis
├── assets/                  favicons (svg + ico) e trilha sonora
└── README.md
```

Nenhuma variável global solta: todo o estado da ficha vive em `js/state.js`
e o estado da interface em um objeto `ui` dentro de `js/ui.js`.
Os eventos usam delegação (um listener no `document`), então o HTML não tem
`onclick=` nem `oninput=` espalhados.

---

## 🧩 Como foi testado

Verificado em Chrome headless com a página servida por `python3 -m http.server`:

- recarregar a página mantém tudo (nome, trilha, nível, desespero, condições, inventário);
- fechar e reabrir o navegador mantém tudo;
- editar `data/trilhas.json` → trilha nova aparece no autocomplete;
- subir/baixar o nível abre e fecha maldições da trilha automaticamente;
- alternar tema → recarregar → tema continua;
- exportar JSON → limpar → importar → ficha idêntica;
- importar JSON do formato antigo (v1) converte com aviso;
- `Ctrl+E` bloqueia de verdade (não edita texto nem mostra botões de remover);
- 360px sem barra horizontal;
- `prefers-reduced-motion` remove as runas;
- console sem erros.

---

## 🆚 O que mudou em relação à versão antiga

| Antes | Agora |
|---|---|
| Um `script.js` de 2.000 linhas com as listas embutidas | Módulos ES separados + 5 JSONs editáveis |
| Nada era salvo ao fechar a página | Salvamento automático (500 ms) + várias fichas |
| Só um tema alternável | Três temas, todos persistidos |
| Maldições em lista solta | Agrupadas por nível, com chave “ativa/inativa” |
| Equipamento sem quantidade/peso | Quantidade, peso, total de espaço e edição inline |
| Sem rolagens | `1d20 + perícia + atributo`, com histórico e destaque de crítico/falha |
| Condições só como texto | Toggle por condição, salvo na ficha e destacado no cabeçalho |
| Áudio começava sozinho (e falhava) | Só toca após o primeiro clique, com botão de mudo |
| CSS único de 866 linhas | 3 folhas: base/temas, componentes e impressão |
