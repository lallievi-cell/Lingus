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

Le nuove storie propongono una **mappa casuale**; puoi inserire un seed per ritrovare la stessa valle oppure scegliere **Seed Zero** per lo scenario originario. La scelta è indipendente da Guidata/Classica. I vecchi salvataggi mantengono il proprio mondo. [MAP-GENERATION.md](docs/MAP-GENERATION.md) descrive generazione, risorse iniziali e prove.

1. Componi **Gruppo + Colpire** e scegli un albero o una roccia. Il selettore vicino usa un raggio di quindici metri; **Tutti gli adulti** include anche i compagni sparpagliati. Scegliere gli esecutori non impartisce ancora un ordine.
2. Le persone si muovono verso il bersaglio e interagiscono fisicamente. Le prime risorse non hanno ancora un nome: il loro aspetto e i tooltip cambiano con le scoperte.
3. Apri una Scintilla dalla mappa o dal pannello della tribù. Durante il puzzle il tempo si ferma. Collega l'esperienza alle parole note; un errore riduce la tensione cognitiva e impone un'attesa.
4. Le nuove parole rendono possibili trasporto, conservazione, strumenti, fuoco e costruzioni. La barra cresce da due a sei spazi secondo vocabolario stabile, catalizzatori e popolazione.
5. Tramanda il sapere ai giovani al Falò. Le parole non innate possono essere dimenticate o andare perdute con l'ultimo custode. Le stele e gli archivi offrono un supporto fisico alla memoria.
6. Con **Sempre** fissa i mestieri. Nelle ere successive governa città, vocazioni, leggi, tributi e rapporti con altre lingue attraverso frasi. L'interfaccia mostra ricette e informazioni; non sostituisce gli ordini con un menu edilizio autonomo.

La barra propone **Solo compatibili** fin dal primo capitolo: dopo ogni parola mostra le continuazioni ammesse dalla grammatica conosciuta. **Tutte**, i tipi e la ricerca restano disponibili. Una frase completa può essere pronunciata anche lasciando vuoti altri spazi. La cronologia ricompone le ultime otto frasi accettate senza eseguirle: controlla il bersaglio e poi pronuncia.

Apri **Anteprima dell’ordine** per verificare esecutori, destinazioni, costi e attività interrotte prima di pronunciare. **Filtri e priorità** organizza la tribù per bisogni e attività; le schede spiegano incarichi e pause. Il pulsante con la foglia accanto al tempo apre la **preparazione stagionale**: manutenzione, cibo, carne cruda e riparo. Gli avvisi sulle parole perdute indicano come rivivere l’esperienza. Se sulla mappa più elementi si sovrappongono, puoi scegliere esplicitamente quale selezionare. Dettagli e limiti delle stime in [UI-QUALITY-OF-LIFE.md](docs/UI-QUALITY-OF-LIFE.md).

In Guidata, **Io** può nascere da un pasto autonomo o da manufatti personali: non occorre isolare un compagno. La prima scoperta richiede il puzzle; per una parola già compresa e poi perduta, una nuova esperienza e una nuova Scintilla permettono **Ricorda la parola**. Prima del consiglio puoi preparare una breve lezione al Falò con due legna consegnate: ottieni fino a dieci Attenzione, poi paghi la lezione ordinaria. Il pannello mostra maestro, allievo, costo ed eventuali impedimenti. La Classica mantiene la risoluzione dei puzzle e la preparazione stagionale precedenti.

**Raduna al campo** pronuncia un vero ordine di movimento: costa una Voce, raggiunge gli adulti disponibili e lascia a terra gli eventuali carichi interrotti. Il richiamo sceglie il miglior riparo reale vicino al campo. Il freddo viene affrontato prima e non annulla un ordine diretto verso un posto più protetto. In Guidata, il Falò ha un nucleo più caldo, visibile nel cerchio interno; in Classica il calore resta uniforme.

Su cellulare, **Parole** o uno spazio della frase aprono una riga compatta di parole compatibili. In verticale la mappa si adatta allo spazio rimasto, senza essere coperta; in orizzontale i suggerimenti stanno sul lato destro. Puoi indicare un bersaglio mentre componi. Una frase completa senza altre continuazioni chiude la palette; i dettagli facoltativi restano disponibili. **Catalogo** apre esplicitamente tutte le parole scoperte e la ricerca. La [revisione del compositore](docs/MOBILE-COMPOSITION.md) documenta geometrie e prove.

Un riepilogo degli incarichi distingue lavoro concluso, fonte esaurita e interruzioni: **Prepara di nuovo** ricompone la frase, che richiede ancora Pronuncia. [PLAYTEST-QUALITY-OF-LIFE.md](docs/PLAYTEST-QUALITY-OF-LIFE.md) riporta parametri, differenze tra modalità e prove.

Il successivo [audit mobile](docs/MOBILE-PLAYTEST-AUDIT.md) riorganizza la schermata per lasciare la mappa visibile all’avvio, corregge i gesti touch e verifica comandi realmente raggiungibili, rotazione e spazio sottratto dalle barre del browser. Sul telefono una parola già inserita si può sostituire senza cancellare quelle successive.

La [revisione visiva delle schermate](docs/MOBILE-SCREEN-REVIEW.md) estende il controllo a diciannove viste: persone e urgenze prima dei riepiloghi, lezioni ricercabili al Falò, finestre con chiusura sempre raggiungibile e scorte delle città più leggibili.

Una stagione dura 90 secondi, di cui 60 di luce e 30 di notte; il primo inverno inizia al secondo 270. La voce ha capienza tre, poi cinque con il Re: gli ordini diretti costano un punto e ne viene recuperato uno ogni dieci secondi. Le istituzioni permanenti eseguono i propri cicli senza quel costo ripetuto.

| Controllo                          | Effetto                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| Clic o trascinamento di una parola | Aggiunge un concetto alla frase.                            |
| Spazio pieno                       | Desktop: rimuove. Telefono: apre la sostituzione.           |
| Clic sulla mappa                   | Seleziona un bersaglio o un punto.                          |
| Scegli il gruppo                   | Imposta il centro del selettore spaziale.                   |
| Tutti gli adulti                   | Seleziona gli adulti disponibili, anche distanti fra loro.  |
| Raduna al campo                    | Ordine di movimento verso il riparo, al costo di una Voce.  |
| Io e selezione di una persona      | Imposta l'individuo che eseguirà l'ordine.                  |
| Trascina la mappa                  | Sposta la visuale.                                          |
| Rotella o `+` / `−`                | Modifica lo zoom.                                           |
| Mirino o minimappa                 | Torna al campo.                                             |
| Spazio                             | Mette in pausa o riprende il tempo.                         |
| `1`, `2`, `3`                      | Velocità 1×, 2×, 4×.                                        |
| Esc                                | Chiude un pannello; nella valle cancella frase e bersaglio. |

Sulla mappa, tronchi e frammenti di pietra a terra sono distinti dagli alberi e dai giacimenti: indicano materiale estratto che deve ancora essere consegnato. Le carcasse sono riconoscibili e chi trasporta mostra il proprio carico. Selezionando un elemento, la scheda distingue «Da estrarre», «A terra», nutrimento sul posto e scorte consegnate; il clic seleziona il bersaglio, poi si impartisce l’ordine. I materiali ancora senza nome restano neutri. Selezionando il Falò acceso, un cerchio dorato mostra l’area riscaldata; in Guidata un secondo cerchio distingue il nucleo più caldo. Essere nel cerchio esterno non garantisce il recupero della temperatura: la scheda spiega la protezione disponibile e le stime stagionali includono il calore effettivo.

Un fumetto segnala l'ultima voce che custodisce una parola: verde, ambra per l'età avanzata, rosso per un pericolo immediato. Il pannello permette di tramandarla al Falò con l'insegnamento e il costo ordinari. Gli addetti liberano temporaneamente il posto per dormire o mangiare, poi riprendono il lavoro; le rese stagionali conservano il lavoro già svolto. Prove e limiti della crescita sono descritti in [GROWTH-AUDIT.md](docs/GROWTH-AUDIT.md).

Orologio, scorte, coesione e dati numerici dipendono dalle parole corrispondenti. Prima di **Numero**, le quantità del mondo sono descritte qualitativamente. L'audio facoltativo comprende ambiente e segnali per ordini accettati, Scintille, nascite, perdita dei custodi e disastri; si attiva con il pulsante del suono.

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

La valle usa uno stile **2D pittorico e naturale**, con terreno materico, vegetazione e animali illustrati, persone differenziate per età ed equipaggiamento, e venti edifici coerenti. [GRAPHICS.md](docs/GRAPHICS.md) mostra un'anteprima e descrive copertura, interazione e prove.

Le azioni hanno pose specifiche e il gruppo occupa posti distinti attorno a fonti, edifici e giacigli. [ANIMATION.md](docs/ANIMATION.md) descrive movimento, animazioni e limiti della distribuzione.

La Barra del Linguaggio e le finestre cambiano materiali nelle sei ere, dalla pietra al marmo e al ferro. Clima, fumo, resti insepolti e malattia hanno effetti visivi legati allo stato reale della valle, con pausa e movimento ridotto. [UI-ATMOSPHERE.md](docs/UI-ATMOSPHERE.md) descrive copertura e verifiche.

La mappa regionale conserva le tracce dei convogli, distingue le vocazioni delle città e mostra colpi alle mura e occupazione. [REGIONAL-MAP.md](docs/REGIONAL-MAP.md) illustra comportamento, compatibilità dei salvataggi e prove.

Le culture straniere raccolgono e conservano cibo fisico, possono razziare quando ostili, inviare richieste, addestrare eserciti e finanziare colonie. Presidi e palizzate contrastano le incursioni; i doni viaggiano realmente. Le delegazioni pacifiche condividono parole senza imporre religioni. [FOREIGN-POLICY.md](docs/FOREIGN-POLICY.md) descrive parametri e limiti verificati.

Le nuove partite propongono **Guidata**, con più margine per il primo Falò, compiti materiali ripetuti e primo inverno senza tormente; **Classica** conserva il ritmo precedente. Entrambe mostrano sesso e fasi di vita, avvisi di nascite e lutti, parole perdute riconoscibili e pausa opzionale sugli eventi. Il pannello della crescita spiega cosa manca alle nascite; gli strumenti in mano corrispondono all'equipaggiamento effettivamente usato. [ONBOARDING-CALIBRATION.md](docs/ONBOARDING-CALIBRATION.md) riporta le differenze e le prove ordinarie.

[FOUR-IMPROVEMENTS.md](docs/FOUR-IMPROVEMENTS.md) raccoglie le ulteriori calibrazioni Guidate, la continuità delle scoperte urbane, l'assistente sintattico e l'audio. [VICTORY-ROUTES.md](docs/VICTORY-ROUTES.md) verifica le tre vie finali con tempo e costi reali da società avanzate preparate; queste prove restano separate dalle campagne complete da sette persone.

[CAMPAIGN-AUDIT.md](docs/CAMPAIGN-AUDIT.md) documenta trenta stagioni ordinarie con ricambio generazionale. [MIDGAME-TRANSITION.md](docs/MIDGAME-TRANSITION.md) distingue la prova 35 → 80 con Scrittura da un insediamento preparato dalla crescita fino a 150, ancora da dimostrare.

- `src/game/content.ts`, `types.ts`, `state.ts`: cataloghi, schema e stato iniziale.
- `src/game/math.ts`: formule isolate; `runtime.ts`: inventario e utilità condivise.
- `src/game/simulation.ts`, `engine.ts`: vita individuale, eventi, lavoro, stagioni, memoria e API dei comandi.
- `src/game/grammar.ts`, `dogmas.ts`: sintassi, ricette e vincoli culturali.
- `src/game/imperial.ts`: città, economia, diplomazia, logistica, leggi, eserciti e condizioni finali.
- `src/App.tsx`, `src/components/`: interfaccia evolutiva e mappa.

Le scelte di interpretazione, rappresentazione e calibrazione sono in [DECISIONS.md](docs/DECISIONS.md); i completamenti e le verifiche aperte sono in [REMAINING.md](docs/REMAINING.md).

Le regole definitive sono riassunte in [DESIGN.md](docs/DESIGN.md). [CONFORMANCE.md](docs/CONFORMANCE.md) collega i requisiti alla fonte e alle prove e collega gli indefiniti alle decisioni adottate. [ROADMAP.md](docs/ROADMAP.md) distingue verifiche ancora necessarie, decisioni di design e lavoro di prodotto.
