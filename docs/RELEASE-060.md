# Otto culture nella regione — 0.6.0

Le nuove storie su **Mappa casuale** ospitano otto culture autonome nella regione di mille metri. Ogni cultura ha preferenze che guidano luoghi d’insediamento, riserve, costruzioni e scambi.

| Cultura                 | Priorità riconoscibile                                |
| ----------------------- | ----------------------------------------------------- |
| Il Popolo dei Rami      | Boschi, scorte e riserve prima dell’espansione.       |
| Le Voci della Selce     | Rilievi, materiali e luoghi di lavoro.                |
| I Figli del Fiume       | Rive, conservazione delle scorte e collegamenti.      |
| I Custodi dell’Alba     | Focolare, memoria e trasmissione del sapere.          |
| Le Genti dei Prati      | Terre aperte e fonti di nutrimento durature.          |
| I Camminatori           | Viaggi, scambi frequenti e collegamenti fra comunità. |
| Le Sentinelle dei Monti | Rilievi e difesa più ferma dei confini condivisi.     |
| Le Mani d’Argilla       | Depositi e consolidamento dei luoghi di lavoro.       |

Le priorità scelgono fra possibilità concrete: edifici e manifatture si pagano, l’estrazione usa lavoro disponibile e le merci viaggiano con le carovane. Gli scambi proteggono i pasti successivi e il combustibile. La scelta di una colonia considera risorse, bioma, percorso e confini; un luogo in acqua o irraggiungibile viene escluso prima di spendere coloni e materiali.

Le nuove culture possono comprendere i concetti necessari a fondare territori attraverso esperienze vissute: utensili fabbricati, custodia di scorte in un deposito e attività sul proprio distretto. Ogni passaggio richiede le parole della ricetta e una testimonianza reale. Non si assegnano automaticamente tutte le conoscenze.

## Leggere e incontrare le comunità

Le schede diplomatiche sono compatte ed espandibili, con un simbolo distinto per ogni cultura. Mostrano identità, relazione e attività fisicamente osservabili; una colonia o una carovana ancora inesplorata non viene rivelata dal riepilogo. Una cultura rimane reperibile attraverso un altro insediamento conosciuto se perde la capitale. **Indica sulla mappa** conserva la frase che stavi componendo.

La panoramica dispone i nomi delle città evitando le sovrapposizioni. Se lo spazio non basta, alcuni nomi secondari vengono omessi; icone, selezione e ricerca da **Elementi** rimangono disponibili.

Le richieste e le razzie delle nuove culture rispettano i contatti e la grazia iniziale di 720 secondi effettivi; diventano possibili dal Neolitico. Possono esserci al massimo due interventi di pressione contemporanei, uno per cultura, con partenze distanziate di novanta secondi effettivi. Questi limiti lasciano tempo per rispondere; non rendono ostili comunità inizialmente pacifiche.

## Partite esistenti e riproduzione

Per incontrare le otto culture occorre iniziare una **nuova storia Casuale**. Seed Zero e le valli precedenti conservano quattro culture e cinquecento metri; le regioni della 0.5.0 conservano i propri mille metri e quattro culture. Il caricamento non aggiunge insediamenti né ricostruisce risorse.

Il salvataggio registra `mapGeneration.regionalCultures: 1` e i profili delle fazioni. Seed, dimensioni e regola di generazione identificano la disposizione riproducibile: riutilizzare oggi un seed della 0.5.0 per una nuova storia può produrre una disposizione diversa, mentre importare il suo salvataggio conserva il mondo giocato.

## Verifiche e seguito

Le prove di generazione esercitano cento seed con otto identità distinte, città asciutte e separate, risorse iniziali ordinarie e determinismo. I percorsi delle otto città sono verificati su quattro seed; confronti con il generatore precedente conservano la compatibilità delle mappe a quattro culture. Le prove economiche, politiche e di interfaccia verificano separatamente decisioni, pagamenti e informazioni visibili. Una scena preparata di epoca urbana non rappresenta una campagna ordinaria.

Uno studio isolato sui seed **1, 42 e 6842** attraversa **quaranta stagioni Guidate**, conservando il calendario corrente. Tutte le otto culture restano vitali ai controlli annuali e fondano colonie attraverso convogli con persone e scorte reali. Non si assegnano loro cibo, parole, abitanti o edifici; si controlla soltanto l’epoca del giocatore e si rimuovono i suoi personaggi per isolare l’economia straniera. Questa prova non certifica una campagna completa del giocatore.

La pianificazione lascia lavoratori per i rifornimenti, protegge combustibile e foraggio invernale e può raggiungere fonti vicine lungo percorsi terrestri, pagando il lavoro dei viaggi. Un deposito pieno non impedisce la prima esperienza con un materiale: l’estrazione lascia una pila reale sul terreno. Le officine non possono estrarre più materiale di quello presente nel nodo.

- [Culture su telefono](images/ui060-cultures-390.png).
- [Panoramica con otto insediamenti](images/ui060-region-overview-390.png).

Le schermate usano una scena urbana preparata per verificare leggibilità e selezione; non rappresentano una progressione economica ordinaria.

Il seguito dell’[espansione del mondo](WORLD-EXPANSION.md) riguarda ambienti con effetti su lavoro e insediamenti, poi coste, pesca, approdi e navigazione.
