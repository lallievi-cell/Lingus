# Mappe casuali e scenario Seed Zero

Le nuove partite nel browser propongono **Casuale**: una regione di **1.000 × 1.000 metri e cento settori**, con biomi, fiume, risorse, animali e posizioni di **otto comunità straniere** generati dal seed. **Seed Zero** conserva la disposizione originaria del documento, su 500 × 500 metri e venticinque settori, con le quattro culture originali. La scelta della mappa è indipendente da **Guidata/Classica** e non cambia i sette personaggi iniziali né le loro conoscenze.

## Scelta e riproduzione

Il seed è un intero tra **0 e 4294967295**, compresi gli estremi. A parità di dimensioni e regola di generazione, lo stesso seed produce la stessa geografia nelle due difficoltà. La 0.6.0 aggiunge la disposizione di otto culture e la 0.7.0 i sei ambienti funzionali: iniziare oggi una nuova storia con il seed di una regione precedente può quindi dare insediamenti e risorse collocati diversamente. Caricare quella regione conserva invece tutte le coordinate salvate. «Nuovo seed» ne sceglie un altro; un campo vuoto permette la scelta automatica. Le impostazioni mostrano il seed originale e le dimensioni della partita. Le opzioni di riavvio non sostituiscono la partita finché non viene confermata la nuova storia.

Una nuova partita ricentra la visuale sul campo e ripristina lo zoom iniziale, anche quando si riutilizza lo stesso seed. Importare una partita inizializza la visuale appropriata al suo stato.

## Geografia e partenza

La regione della 0.5.0 ha **quattro volte la superficie** della valle precedente. I cento settori misurano ancora cento metri per lato: il campo nasce al centro di un settore della prateria centrale, alle coordinate 550, 550. Le risorse iniziali conservano le distanze del lavoro locale; boschi, rilievi e risorse esterne occupano il territorio aggiuntivo. Il fiume collega due bordi attraverso una catena connessa di settori: disegno e collocamento delle risorse usano gli stessi segmenti. Persone, fauna e convogli condividono i guadi introdotti nella 0.4.0.

Lo zoom iniziale locale resta al 450%; la vista urbana parte dal 50% e può scendere al 45% per inquadrare la regione. Selezione, nebbia di esplorazione, illuminazione e minimappa usano l’intera estensione. Le dimensioni della cache del terreno rimangono limitate a 3.600 × 2.400 pixel; persone, risorse ed edifici vengono disegnati separatamente.

I salvataggi precedenti conservano dimensioni, comunità e regola di attraversamento salvate: le valli restano di 500 metri e le regioni della 0.5.0 restano di mille metri con quattro culture. Seed Zero mantiene lo scenario e i movimenti originari. Caricare una partita non ne estende il territorio e non aggiunge comunità: la nuova geografia si ottiene iniziando una nuova storia casuale.

Il generatore riserva risorse fisiche raggiungibili, con quantità effettive:

- campo libero entro nove metri;
- primo albero a venti–ventotto metri dal campo, con una roccia a sei–dieci metri dall'albero;
- almeno ottanta bacche entro venticinque metri e altri tre nodi alimentari fra cinquanta e settanta metri;
- almeno duecentoquaranta legna entro sessanta metri, due rocce da cento pietre e un giacimento da cinquecento minerali entro sessantacinque metri;
- sei cervi vicini e posizioni iniziali dei predatori ad almeno centodieci metri dal campo.

Le entità sono distanziate, con identificativi, settore e origine coerenti. Nodi e villaggi restano sulla terra asciutta, fuori dall'acqua. Le città straniere occupano settori esterni differenti, lontani dal campo e separati fra loro. Nelle nuove regioni i siti già validi vengono assegnati alle otto culture considerando preferenze per boschi, rilievi, pianure e vicinanza al fiume. È una preferenza fra luoghi disponibili, non una garanzia di ottenere il bioma favorito.

Il Popolo dei Rami, Le Voci della Selce, I Figli del Fiume e I Custodi dell’Alba conservano identità e parole iniziali. Si aggiungono Le Genti dei Prati, I Camminatori, Le Sentinelle dei Monti e Le Mani d’Argilla. Ciascuna comunità parte con le stesse dimensioni e scorte ordinarie di un insediamento straniero; il giocatore conserva i sette fondatori e le quattro parole innate. Le preferenze culturali cambiano le decisioni, senza moltiplicatori di produzione.

Fuori dal campo la densità di alberi, bacche, pietre e minerali dipende dal bioma. Nelle nuove regioni della 0.7.0, zone umide vicine al fiume hanno più bacche; terre aride lontane dalle rive hanno pochi alberi e bacche e più pietra. I nuovi ambienti restano fuori dall’intorno iniziale del campo. La capacità faunistica è ventiquattro nei boschi, dodici in montagna e nelle terre aride e venti negli altri settori. Se i rilievi disponibili sono occupati dagli insediamenti, il mammut può comparire in un'altra zona asciutta e distante. Le distanze di sicurezza riguardano la disposizione iniziale; fauna e persone continuano poi a muoversi secondo la simulazione.

La [0.7.0](RELEASE-070.md) rende fertili o più faticosi da attraversare i diversi terreni. Campi, viaggi fisici e logistica straniera usano gli stessi profili ambientali. I guadi restano gli unici attraversamenti del fiume. La scheda della selezione esplorata espone gli effetti in **Terreno**, secondo le conoscenze di Agricoltura e Numero.

## Salvataggi e generazione

La generazione ha uno stream casuale separato: creare la mappa non consuma i tiri della simulazione. Il salvataggio conserva `mapGeneration` con modalità, seed originale e versione del generatore (**1**), oltre alle coordinate e quantità effettive del mondo. `state.seed` continua a evolvere per gli eventi della partita.

Le nuove mappe casuali conservano anche `mapGeneration.landNavigation: 1`, che abilita fiume fisico e guadi. I passaggi vengono ricavati dalla geografia salvata con la stessa versione della regola; non consumano casualità e non spostano risorse o insediamenti. L’assenza del campo conserva i movimenti precedenti. [RELEASE-040.md](RELEASE-040.md) descrive interazioni e compatibilità.

Solo le regioni estese aggiungono `mapGeneration.worldSize: 1000`. Senza questo campo, l’estensione resta 500 metri. La validazione controlla l’intera griglia e tutti i limiti fisici in base alla dimensione salvata; una valle non può accettare coordinate regionali aggiungendo settori isolati.

Le nuove regioni della 0.6.0 aggiungono `mapGeneration.regionalCultures: 1`, che identifica la disposizione di otto culture. Ogni fazione conserva il proprio profilo in `culture`. L’assenza dei nuovi campi nei salvataggi precedenti mantiene le comunità esistenti e le decisioni dell’IA precedenti. Il seed va interpretato insieme alle dimensioni e alla regola di generazione registrata.

Le nuove regioni della 0.7.0 aggiungono `mapGeneration.biomeRules: 1`. Senza questo campo non cambiano velocità o fertilità; i salvataggi precedenti non ricevono zone umide o terre aride. I nuovi tipi di bioma sono validi soltanto con il metadato coerente. La regola non si applica alle valli casuali di cinquecento metri né a Seed Zero.

Il caricamento usa il mondo salvato: una roccia già scavata conserva la quantità restante e gli animali mantengono la posizione raggiunta. Non ricostruisce la mappa dal seed. Il metadato è facoltativo per i vecchi salvataggi v2; quando manca, l'interfaccia indica che il seed originale non è registrato.

L'API `createGame(seed, playMode)` mantiene Seed Zero per i replay e i test precedenti. `createGame(seed, playMode, 'random')` genera ancora una valle di 500 metri e quattro culture per compatibilità. Il browser richiede esplicitamente la regione con `createGame(seed, playMode, 'random', 1000)`; dalla 0.6.0 questa chiamata crea otto culture e dalla 0.7.0 abilita anche gli ambienti funzionali. Il quarto argomento omesso vale 500.

## Prove

`worldGeneration.test.ts` controlla oltre cento seed, compresi zero e il massimo, per determinismo, diversità effettiva, risorse iniziali, vincoli spaziali, fiumi, fauna e collegamenti fra città e settori. Una revisione separata ha esercitato duemila mondi senza eccezioni. `mapIdentity.test.ts` controlla indipendenza dalla difficoltà, tiri casuali separati, persistenza del seed originale, importazione dei mondi giocati e compatibilità precedente.

`regionGeneration.test.ts` verifica geografia regionale, risorse locali, identificativi e determinismo; conserva anche confronti della generazione precedente di 500 metri. `regionNavigation.test.ts`, `regionGameBounds.test.ts` e `regionSaveValidation.test.ts` esercitano percorsi, interazioni, trasporti, colonie e salvataggi oltre il vecchio confine di cinquecento metri. Le prove browser regionali controllano lo zoom locale, la vista urbana, la selezione e la copertura del terreno, della nebbia e della notte.

`regionalCulturesGeneration.test.ts` esercita cento seed con otto identità distinte, città asciutte e separate, geografia riproducibile e risorse iniziali ordinarie. Verifica i percorsi delle otto città su quattro seed di riferimento e conserva cinque confronti SHA del generatore regionale precedente a quattro culture. Le prove dell’IA e dell’interfaccia sono distinte dalla generazione: i loro limiti sono descritti in [RELEASE-060.md](RELEASE-060.md).

`regionOpening.test.ts` avvia le nuove Guidate di mille metri sui seed **1, 42 e 6842**, con il calendario corrente di 150 secondi per stagione. Usando ordini pubblici e bersagli visibili, ottiene il Falò entro **350 secondi**, un utensile pagato e combustibile consegnato, con i sette fondatori vivi e senza ordini rifiutati. Non prepara scorte, parole o posizioni. Eventuali nascite si aggiungono ai fondatori. Questa prova copre l’apertura, non una campagna pluriennale.

I replay precedenti restano sulla valle di cinquecento metri e sul calendario precedente. `randomOpening.test.ts` parte da cinque mappe generate e usa soltanto ordini pubblici di gruppo su decisioni distanziate di dieci secondi. I bersagli sono visibili, i materiali vengono estratti e consegnati e il Fuoco viene dedotto da una Scintilla reale: Falò **entro 210 secondi**, sette vivi e combustibile residuo nei cinque casi. Un fulmine favorevole può anticiparlo: sul seed 42 il Falò nasce a 128,25 secondi e il percorso completa comunque un utensile pagato a 165 secondi. La selezione usa un gruppo effettivamente presente, arrotondato a metri interi, e la lavorazione utilizza la pietra già colpita e visibile. La prova non prepara scorte, conoscenze o posizione dell'artigiano.

Altre cinque prove estendono questa rotta. Quattro seed (0, 1, 42 e 6842) arrivano a **360 secondi** con almeno sei persone vive, coesione almeno settanta e insegnamento pagato, usando al massimo diciotto ordini sulla stessa griglia di dieci secondi. Il gruppo viene richiamato attraverso il selettore pubblico del Falò quando si disperde; i prelievi hanno bersagli visibili e non risultano ordini rifiutati. Le eventuali morti sono esclusivamente di vecchiaia. La mappa casuale con seed `0` è esercitata anche fino a 390 secondi, con almeno sei superstiti, salute minima sessanta e coesione almeno novanta. La calibrazione delle lezioni e il rinforzo del lavoro cambiano i successivi campionamenti casuali: non si forza la sopravvivenza senile di Uma per conservare un precedente esito del seed. All'inizio della nuova primavera il cibo va rifornito: queste prove non certificano un'economia pluriennale o una partita completa fino alle vittorie.

Le prove browser coprono default casuale, seed esplicito, difficoltà indipendente, Seed Zero, estremi e input errati, riavvio annullato, importazione, risorse consumate, camera e schermi stretti. La verifica delle campagne pluriennali fino a trentacinque e centocinquanta persone resta separata.
