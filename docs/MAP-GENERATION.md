# Mappe casuali e scenario Seed Zero

Le nuove partite nel browser propongono **Casuale**: biomi, fiume, risorse, animali e posizioni dei quattro villaggi stranieri vengono generati dal seed. **Seed Zero** conserva la disposizione originaria del documento. La scelta della mappa è indipendente da **Guidata/Classica** e non cambia i sette personaggi iniziali né le loro conoscenze.

## Scelta e riproduzione

Il seed è un intero tra **0 e 4294967295**, compresi gli estremi. Lo stesso seed produce la stessa geografia nelle due difficoltà. «Nuovo seed» ne sceglie un altro; un campo vuoto permette la scelta automatica. Le impostazioni mostrano il seed originale della partita. Le opzioni di riavvio non sostituiscono la partita finché non viene confermata la nuova storia.

Una nuova partita ricentra la visuale sul campo e ripristina lo zoom iniziale, anche quando si riutilizza lo stesso seed. Importare una partita inizializza la visuale appropriata al suo stato.

## Geografia e partenza

Il mondo mantiene **500 × 500 metri e 25 settori**. Il campo comincia nella prateria centrale; cambiano disposizione dei boschi e dei rilievi, corso del fiume e posizione dei nodi. Il fiume collega due bordi attraverso una catena connessa di settori: disegno e collocamento delle risorse usano gli stessi segmenti. I fiumi conservano la traversabilità dell'attuale simulazione.

Il generatore riserva risorse fisiche raggiungibili, con quantità effettive:

- campo libero entro nove metri;
- primo albero a venti–ventotto metri dal campo, con una roccia a sei–dieci metri dall'albero;
- almeno ottanta bacche entro venticinque metri e altri tre nodi alimentari fra cinquanta e settanta metri;
- almeno duecentoquaranta legna entro sessanta metri, due rocce da cento pietre e un giacimento da cinquecento minerali entro sessantacinque metri;
- sei cervi vicini e posizioni iniziali dei predatori ad almeno centodieci metri dal campo.

Le entità sono distanziate, con identificativi, settore e origine coerenti. Nodi e villaggi restano sulle rive, fuori dall'acqua. Le città straniere occupano settori esterni differenti, lontani dal campo. Il generatore conserva identità, parole, dogmi e scorte iniziali delle quattro culture; la loro posizione cambia.

Fuori dal campo la densità di alberi, bacche, pietre e minerali dipende dal bioma. La capacità faunistica è ventiquattro nei boschi, dodici in montagna e venti negli altri settori. Se i rilievi disponibili sono occupati dagli insediamenti, il mammut può comparire in un'altra zona asciutta e distante. Le distanze di sicurezza riguardano la disposizione iniziale; fauna e persone continuano poi a muoversi secondo la simulazione.

## Salvataggi e generazione

La generazione ha uno stream casuale separato: creare la mappa non consuma i tiri della simulazione. Il salvataggio conserva `mapGeneration` con modalità, seed originale e versione del generatore (**1**), oltre alle coordinate e quantità effettive del mondo. `state.seed` continua a evolvere per gli eventi della partita.

Il caricamento usa il mondo salvato: una roccia già scavata conserva la quantità restante e gli animali mantengono la posizione raggiunta. Non ricostruisce la mappa dal seed. Il metadato è facoltativo per i vecchi salvataggi v2; quando manca, l'interfaccia indica che il seed originale non è registrato.

L'API `createGame(seed, playMode)` mantiene Seed Zero per i replay e i test precedenti. `createGame(seed, playMode, 'random')` richiede esplicitamente la geografia generata; il browser usa questa scelta come nuovo default.

## Prove

`worldGeneration.test.ts` controlla oltre cento seed, compresi zero e il massimo, per determinismo, diversità effettiva, risorse iniziali, vincoli spaziali, fiumi, fauna e collegamenti fra città e settori. Una revisione separata ha esercitato duemila mondi senza eccezioni. `mapIdentity.test.ts` controlla indipendenza dalla difficoltà, tiri casuali separati, persistenza del seed originale, importazione dei mondi giocati e compatibilità precedente.

`randomOpening.test.ts` parte da cinque mappe generate e usa soltanto ordini pubblici di gruppo su decisioni distanziate di dieci secondi. I bersagli sono visibili, i materiali vengono estratti e consegnati e il Fuoco viene dedotto da una Scintilla reale: Falò a **180,25 secondi**, sette vivi e combustibile residuo nei cinque casi. La prova non prepara scorte, conoscenze o posizione dell'artigiano.

Altre cinque prove estendono questa rotta. Quattro seed (0, 1, 42 e 6842) arrivano a **360 secondi** con **sette–otto persone vive, coesione cento e una–due lezioni pagate**, usando quattordici–sedici ordini totali sulla stessa griglia di dieci secondi. Il gruppo viene richiamato attraverso il selettore pubblico del Falò quando si disperde; i prelievi hanno bersagli visibili e non risultano ordini rifiutati. Non si verificano morti nei quattro anni provati. La mappa casuale con seed `0` è esercitata anche fino a 390 secondi, con sette vivi e salute minima superiore a ottantasei. All'inizio della nuova primavera il cibo va rifornito: queste prove non certificano un'economia pluriennale o una partita completa fino alle vittorie.

Le prove browser coprono default casuale, seed esplicito, difficoltà indipendente, Seed Zero, estremi e input errati, riavvio annullato, importazione, risorse consumate, camera e schermi stretti. La verifica delle campagne pluriennali fino a trentacinque e centocinquanta persone resta separata.
