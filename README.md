# Lingus

Un gioco di sopravvivenza e civiltà nel quale il linguaggio determina ciò che una comunità può comprendere, ordinare e ricordare. Si comincia con sette persone e quattro parole innate. Le esperienze producono Scintille, le frasi dirigono le azioni, il Falò tramanda la memoria e i dogmi trasformano i traumi in vincoli duraturi.

Questa revisione estende il primo prototipo all'intero catalogo del documento `lingus.docx`: **45 parole, sei Tier, 14 risorse fisiche, 20 edifici**, tradizioni, scrittura, leggi, città, diplomazia e tre condizioni finali. L'esistenza del catalogo e dei moduli non certifica la conformità al 100% né il completamento di una partita ordinaria fino a ogni vittoria: requisiti, prove e decisioni sono distinti in [CONFORMANCE.md](docs/CONFORMANCE.md).

## Avvio

Richiede Node.js 22 o successivo; l'ambiente cloud usa la versione 24 indicata in `.nvmrc`. React, TypeScript, Vite, font e icone sono dipendenze locali. Non servono database, account, chiavi API o servizi esterni per giocare.

```bash
cd /workspace/Lingus
npm ci
npm run dev -- --port 5173 --strictPort
```

Per una build statica:

```bash
npm run build
npm run preview -- --port 4173
```

L'output è in `dist/`. I processi devono essere riavviati quando una sessione cloud viene ripristinata. Pubblicare l'ambiente cloud, fare push del codice e distribuire il gioco su un servizio web sono operazioni distinte.

## Come giocare

1. Componi **Gruppo + Colpire** e scegli un albero o una roccia. Il gruppo viene chiamato entro un raggio di quindici metri dal punto di selezione; puoi cambiarlo con **Scegli il gruppo**.
2. Le persone si muovono verso il bersaglio e interagiscono fisicamente. Le prime risorse non hanno ancora un nome: il loro aspetto e i tooltip cambiano con le scoperte.
3. Apri una Scintilla dalla mappa o dal pannello della tribù. Durante il puzzle il tempo si ferma. Collega l'esperienza alle parole note; un errore riduce la tensione cognitiva e impone un'attesa.
4. Le nuove parole rendono possibili trasporto, conservazione, strumenti, fuoco e costruzioni. La barra cresce da due a sei spazi secondo vocabolario stabile, catalizzatori e popolazione.
5. Tramanda il sapere ai giovani al Falò. Le parole non innate possono essere dimenticate o andare perdute con l'ultimo custode. Le stele e gli archivi offrono un supporto fisico alla memoria.
6. Con **Sempre** fissa i mestieri. Nelle ere successive governa città, vocazioni, leggi, tributi e rapporti con altre lingue attraverso frasi. L'interfaccia mostra ricette e informazioni; non sostituisce gli ordini con un menu edilizio autonomo.

Una stagione dura 90 secondi, di cui 60 di luce e 30 di notte; il primo inverno inizia al secondo 270. La voce ha capienza tre, poi cinque con il Re: gli ordini diretti costano un punto e ne viene recuperato uno ogni dieci secondi. Le istituzioni permanenti eseguono i propri cicli senza quel costo ripetuto.

| Controllo                          | Effetto                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| Clic o trascinamento di una parola | Aggiunge un concetto alla frase.                            |
| Clic su uno spazio pieno           | Rimuove quella parola.                                      |
| Clic sulla mappa                   | Seleziona un bersaglio o un punto.                          |
| Scegli il gruppo                   | Imposta il centro del selettore spaziale.                   |
| Io e selezione di una persona      | Imposta l'individuo che eseguirà l'ordine.                  |
| Trascina la mappa                  | Sposta la visuale.                                          |
| Rotella o `+` / `−`                | Modifica lo zoom.                                           |
| Mirino o minimappa                 | Torna al campo.                                             |
| Spazio                             | Mette in pausa o riprende il tempo.                         |
| `1`, `2`, `3`                      | Velocità 1×, 2×, 4×.                                        |
| Esc                                | Chiude un pannello; nella valle cancella frase e bersaglio. |

Orologio, scorte, coesione e dati numerici dipendono dalle parole corrispondenti. Prima di **Numero**, le quantità del mondo sono descritte qualitativamente. I suoni ambientali sono facoltativi.

## Salvataggi

Autosave ogni cinque secondi nel `localStorage` del browser, chiave `lingus.save.v2`. La ripresa avviene in pausa. Le impostazioni consentono salvataggio immediato, esportazione/importazione JSON e nuova partita dopo conferma.

Lo schema corrente è **2**: separa bacche, carne, carne cotta e le altre risorse, e conserva istituzioni, città e stato geopolitico. Lo schema precedente aggregava dati che non possono essere ricostruiti fedelmente; i vecchi salvataggi non vengono convertiti inventando risorse. La chiave `lingus.save.v1` resta distinta. Un import non valido o oltre cinque megabyte viene rifiutato.

Il salvataggio appartiene all'origine e al browser utilizzati. Esporta una copia per trasferirlo o conservarlo indipendentemente dal browser.

## Verifiche

```bash
npm test
npm run build
npm run test:e2e
npm run format:check
```

- `conformance.test.ts` contiene valori attesi trascritti dal documento: profili iniziali, cataloghi, formule e casi di confine. Distingue le formule letterali dalle decisioni rese necessarie da contraddizioni nella fonte.
- Il replay ordinario del Seed Zero6842 supera il primo inverno usando soltanto ordini, Scintille reali e Attenzione guadagnata, con fuoco e scorte costruiti e almeno quattro superstiti.
- Le altre suite del motore verificano transizioni e collegamenti tra simulazione, grammatica, istituzioni e sistemi imperiali.
- Playwright esercita l'interfaccia nel browser. I test che preparano uno stato avanzato verificano quel sistema: non dimostrano una partita completa partita da zero.

Playwright usa `PLAYWRIGHT_CHROMIUM_EXECUTABLE` se impostata, altrimenti `/usr/bin/chromium` quando disponibile. In assenza di un browser di sistema:

```bash
npx playwright install chromium
```

Il server di sviluppo viene avviato automaticamente dai test oppure riutilizzato fuori dalla CI. Gli esiti effettivi della revisione sono riportati nel registro di conformità e nel resoconto di consegna, non dedotti dalla sola presenza dei comandi.

## Struttura e fedeltà

- `src/game/content.ts`, `types.ts`, `state.ts`: cataloghi, schema e stato iniziale.
- `src/game/math.ts`: formule isolate; `runtime.ts`: inventario e utilità condivise.
- `src/game/simulation.ts`, `engine.ts`: vita individuale, eventi, lavoro, stagioni, memoria e API dei comandi.
- `src/game/grammar.ts`, `dogmas.ts`: sintassi, ricette e vincoli culturali.
- `src/game/imperial.ts`: città, economia, diplomazia, logistica, leggi, eserciti e condizioni finali.
- `src/App.tsx`, `src/components/`: interfaccia evolutiva e mappa.

Le regole definitive sono riassunte in [DESIGN.md](docs/DESIGN.md). [CONFORMANCE.md](docs/CONFORMANCE.md) collega i requisiti alla fonte e alle prove e registra le ambiguità residue. [ROADMAP.md](docs/ROADMAP.md) distingue verifiche ancora necessarie, decisioni di design e lavoro di prodotto.
