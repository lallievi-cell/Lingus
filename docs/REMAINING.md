# Cosa manca alla verifica integrale della guida

Gli indefiniti della fonte hanno decisioni eseguibili in [DECISIONS.md](DECISIONS.md). Restano le verifiche sotto elencate: risolvere un parametro non equivale a dimostrare una campagna completa.

## Ultimi comportamenti espliciti completati

| Voce                               | Completamento e prova                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mercanti stranieri e dazio del 20% | Partenze autonome con merci e monete sottratte alle scorte straniere; riscossione una sola volta alla frontiera, arresto e intercettazione in caso di rifiuto, scambio e ritorno fisico. 13 test in `foreignCommerce.test.ts`; nessun doppio accredito e nessuna ricompensa per scambi vuoti.                   |
| Legge del Taglione                 | Il Tribunale restituisce il danno effettivamente inflitto, compreso il limite degli HP residui della vittima, e aggiunge 10 coesione. Un ordine pubblico raggiunge il colpo senza ricevere la generica pena preventiva di 40 HP.                                                                                |
| Omicidio, risse e faide            | Aggressioni fra cittadini collegate al combattimento; esecuzione dopo una morte reale, con cadavere, perdita dei custodi e coorti aggiornati. Risse in crisi di scarsità e risposta del testimone usano persone e cibo reali. La legge contro l’omicidio interrompe la vendetta. 18 test in `civilLaw.test.ts`. |
| Monopoli sul lavoro urbano         | Un re o individuo non può occupare contemporaneamente più edifici: identità e coorte vengono prenotate anche contro le assegnazioni ordinarie. Tre test di regressione in `workerReservations.test.ts`.                                                                                                         |
| Presenza dello Straniero nei culti | Visitatori vivi e carovane straniere sono riconosciuti soltanto entro i confini effettivi; cittadini, morti e rotte terminate non simulano una presenza straniera. Tre ulteriori test di policy dogmatica.                                                                                                      |

La fonte intitola “25” il catalogo delle leggi, ma presenta 23 frasi distinte. La decisione A-29 conserva queste frasi e il compilatore generale, senza inventare due archetipi.

## Produzione, riposo e memoria

[GROWTH-AUDIT.md](GROWTH-AUDIT.md) documenta i difetti trovati nel lavoro stagionale: perdita permanente degli incarichi durante il riposo, Sempre che impedisce il sonno e raccolto nullo quando gli addetti hanno lasciato gli slot a fine notte. La contabilità temporale A-34 corregge questi comportamenti senza aumentare la formula delle nascite. Gli ultimi custodi sono segnalati con avvisi e trasmissione ordinaria al Falò. Queste correzioni non chiudono automaticamente le campagne sotto elencate.

## Verifiche ancora aperte

- **Campagne dal Seed Zero alle ere successive:** la rotta ordinaria supera il primo inverno; non sono ancora dimostrate campagne complete fino a 35 e 150 persone, ricambio generazionale, scrittura e città.
- **Tre vittorie partendo dall’inizio:** condizioni finali e casi limite sono verificati su stati avanzati preparati. Non dimostrano che ciascuna vittoria sia raggiungibile da una nuova partita senza interventi sullo stato.
- **Requisiti e interazioni da esercitare:** il registro contiene ancora righe con prove parziali o da svolgere, per esempio probabilità alimentari, alcuni disastri, rese e combinazioni di istituzioni, dogmi, leggi e combattimenti. La matrice dogmatica completa non equivale a ogni effetto provato in ciascun contesto.

Questi sono limiti della verifica attuale. Non sono dichiarati meccaniche assenti in mancanza di un difetto identificato. Se un replay o un test rivela un errore, occorre correggerlo prima di chiudere il relativo requisito.

## Segnalazioni successive corrette

[BUG-AUDIT.md](BUG-AUDIT.md) documenta quattro ulteriori difetti: sfasamento delle operazioni stagionali, bersagli della Caccia Grossa, effetti della Gerontocrazia e priorità alimentare persistente. Le correzioni includono contabilità del nuovo raccolto provinciale e attribuzione dei risultati di lavoro alla stagione effettivamente conclusa.

## Altri difetti corretti nella revisione

Rispetto al commit iniziale sono stati collegati alla simulazione: parassiti sul lavoro, allenamento della Forza, usura e assegnazione individuale degli utensili, tradizioni notturne, addetti degli edifici, istruzione operativa, eredità da entrambi i genitori, frazioni di riproduzione della fauna, effetti specifici delle leggi, prove stagionali dei doveri, soggetti punibili, confische fisiche, debiti proporzionali, Inquisizione, milizia dei saggi del Valhalla, monopoli produttivi, conflitti dogmatici e malus diplomatici. Anche i pannelli cognitivi rispettano la conoscenza di Numero e dei materiali.

[CONFORMANCE.md](CONFORMANCE.md) associa le prove ai singoli requisiti. La fedeltà integrale potrà essere dichiarata soltanto dopo le verifiche ancora aperte e la correzione degli eventuali difetti emersi, secondo le decisioni adottate.
