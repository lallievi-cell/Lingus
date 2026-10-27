# Audit della versione per telefono

La schermata inviata dal giocatore ha rivelato problemi del layout mobile presente nel commit `423f793`: banco delle parole aperto all’avvio, mappa coperta, azioni principali su una striscia orizzontale insieme alla cronologia e compositore troppo alto. Le prove precedenti controllavano soprattutto geometria e assenza di scorrimento della pagina; potevano passare anche con una mappa quasi interamente coperta.

## Riproduzione del problema

L’audit usa viewport CSS che rappresentano lo spazio lasciato libero dalle barre del browser, anziché l’intero display fisico. La riproduzione Chromium con touch e densità 1,5 include `384 × 720`, vicina alla schermata segnalata, e `360 × 640`.

| Viewport  | Mappa prima della revisione | Effetto del banco aperto                                  |
| --------- | --------------------------- | --------------------------------------------------------- |
| 384 × 720 | Circa 329 px di altezza     | Circa 245 px coperti, quasi il 74% della mappa.           |
| 360 × 640 | Circa 249 px di altezza     | Circa 245 px coperti: rimanevano circa 4 px utilizzabili. |
| 844 × 390 | Circa 104 px di altezza     | Il banco poteva coprire l’intera area della mappa.        |

Dopo la revisione, con banco chiuso e tutti i controlli effettivamente raggiungibili:

| Viewport  | Altezza mappa | Altezza compositore |
| --------- | ------------: | ------------------: |
| 360 × 640 |  283 px (44%) |              156 px |
| 384 × 720 |  363 px (50%) |              156 px |
| 844 × 390 |  149 px (38%) |              108 px |

Questi casi non producevano necessariamente uno scorrimento orizzontale del documento. Il controllo corretto deve considerare anche sovrapposizioni, ritaglio dei contenitori e quale elemento riceve effettivamente il tocco.

## Nuova organizzazione

Il banco **Parole** è chiuso all’avvio del telefono. Si apre dal pulsante o toccando uno spazio della frase. Ha chiusura esplicita e un’azione per tornare alla mappa senza perdere la frase; apertura, ricerca e cambio dei filtri non impartiscono ordini.

Il compositore conserva le azioni principali fuori dalle strisce scorrevoli: **Tutti gli adulti** e **Raduna al campo** occupano una riga distinta. Le frasi recenti e la selezione vicina stanno in **Persone e ordini**. Ricerca e filtri aggiuntivi si aprono quando servono, lasciando visibili le parole da scegliere. La ricerca usa caratteri di almeno 16 px sul telefono per evitare l’ingrandimento automatico dell’input nei browser che lo applicano.

Toccare una parola già inserita sul telefono permette di sostituirla, conservando gli altri spazi della frase; il pulsante del cestino rimuove soltanto quella selezionata. La matita distingue la modifica dalla cancellazione. Il desktop conserva la propria interazione precedente. L’anteprima dell’ordine rimane accessibile dal suo controllo dedicato: costi, esecutori e impedimenti continuano a derivare dal gestore effettivo degli ordini.

La mappa riceve lo spazio rimasto dopo i controlli reali. Gli avvisi condividono un’area limitata e scorrevole; il suggerimento iniziale si espande su richiesta. L’altezza tiene conto del viewport visibile, delle aree sicure e dei cambiamenti provocati dalle barre del browser e dalla tastiera. Durante la ricerca con tastiera aperta, lo spazio va a input e risultati: frase, Pronuncia e pausa restano accessibili. È stato verificato anche un risultato selezionabile a 384 × 420. In orizzontale, intestazione e navigazione condividono lo spazio disponibile.

## Gesti e dettagli della mappa

Il pinch mantiene il punto del mondo sotto il centro delle dita e considera anche lo spostamento delle due dita. Raggiungere il limite dello zoom non deve provocare uno scatto del punto osservato. Il passaggio da due dita a una non deve selezionare un bersaglio involontariamente.

Un tocco non lascia attivo un vecchio suggerimento del mouse. Doppio tocco e pressione prolungata non applicano le scorciatoie del mouse per cambiare gruppo. Le scorciatoie del mouse restano disponibili sul desktop. Il clic sintetico di rilascio non può scegliere un elemento del menu appena comparso: occorre un nuovo tocco esplicito.

Le schede dei bersagli possono cambiare posizione per lasciare visibile l’oggetto selezionato; in orizzontale lasciano libera anche la minimappa. Testi lunghi e scelte fra oggetti sovrapposti rimangono consultabili tramite scorrimento. I dettagli non danno accesso a risorse o nomi che la tribù non conosce ancora.

## Prove richieste

Le nuove verifiche controllano l’App reale e i gesti della mappa, senza dedurre l’usabilità dalla sola assenza di overflow:

- `mobile-playtest.spec.ts`: mappa iniziale visibile, comandi interamente raggiungibili al tocco, composizione e ordine con costo Voce reale, navigazione senza perdita della frase, rotazione, riduzione dell’altezza disponibile, modifica di una frase a sei parole e ricerca con viewport ridotto per simulare la tastiera;
- `map-touch.spec.ts`: gesti touch reali sul Canvas, conservazione del bersaglio osservato durante il pinch, assenza di selezioni accidentali e leggibilità dei dettagli;
- `mapGestures.test.ts`: geometria del pinch indipendente dalla densità del display e casi ai limiti dello zoom;
- le suite browser precedenti mantengono le verifiche su materiali dell’interfaccia, preparazione stagionale, trasmissione delle parole, eventi della tribù e salvataggi.

Le verifiche mobile iniziali richiedono una mappa che occupi almeno il 40% dell’altezza disponibile in verticale e il 25% in orizzontale. Un controllo primario deve trovarsi nel viewport, avere almeno 44 px di altezza ed essere effettivamente raggiunto dal punto centrale del tocco. La striscia delle azioni principali non deve scorrere lateralmente.

I casi con stato preparato isolano l’ergonomia; non costituiscono prove di una campagna completa. Chromium con emulazione touch e riduzione del viewport esercita regressioni riproducibili, ma non equivale a una prova su tutti i telefoni fisici, su Safari o con ogni tastiera di sistema. La revisione comprende 1.098 test unitari/integrati e 114 casi browser. La build compilata è stata inoltre aperta sotto il percorso `/Lingus/`, con composizione touch e un ordine reale in verticale e in orizzontale.

## Controllo prima della pubblicazione

Il workflow Pages usa Node.js 24, coerente con il requisito del progetto e con l’ambiente cloud. Esegue formattazione, test unitari, build e le prove critiche `mobile-playtest.spec.ts` e `map-touch.spec.ts` con Chromium prima di caricare l’artefatto. Un fallimento di questi controlli impedisce a quel workflow di raggiungere il deploy.

La configurazione Vite usa percorsi relativi adatti a `/Lingus/`; nel progetto non è presente un service worker che mantenga una vecchia interfaccia. Durante questo audit le letture del sito Pages e delle API GitHub hanno ricevuto HTTP 403 dal proxy dell’ambiente: non è stato possibile certificare la versione pubblicata, né attribuire lo screenshot a una cache obsoleta.

Dopo il push, la verifica del rilascio deve confrontare lo SHA del workflow con quello del commit, controllare l’esito del deploy e aprire gli asset effettivamente pubblicati. Push verificato e sito pubblico verificato sono due risultati distinti. Nessun workflow viene avviato manualmente da questo audit.
