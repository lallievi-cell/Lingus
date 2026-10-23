# Crescita ordinaria e custodi della memoria

Questa revisione prosegue dai commit dell'utente fino a `5566251` e preserva anche `fc2edbf`–`5566251`: selezione rapida del gruppo, Echi, suggerimenti, scorciatoie, tre tab mobili, banco parole touch, pinch a 1600% e configurazione GitHub Pages. Conserva il nuovo viewport, il giaciglio senza un Falò già costruito, la distinzione fra fuoco acceso e spento, le due notti necessarie per scoprire Qui e la possibilità di accendere il Falò anche durante l'ipotermia.

## Difetti individuati nei turni

Il problema demografico non si riduce al coefficiente di nascita. Sono stati individuati tre comportamenti che ostacolano la produzione e il riposo:

- Un addetto che esce per dormire o mangiare perde definitivamente il proprio incarico, anziché liberare temporaneamente lo slot.
- Una tradizione Sempre può riassegnare il lavoro durante la notte ordinaria. Anche un tentativo fallito perché tutti i posti sono occupati può impedire l'istinto del sonno.
- La resa stagionale usa soltanto gli addetti presenti alla chiusura della stagione, dopo la notte. Un campo lavorato durante il giorno può quindi produrre zero.

La riproduzione isolata del terzo difetto parte da uno stato dichiaratamente preparato a 235 s: campo con tre addetti, scorte sufficienti e ordine di Semina. A 239 s l'efficienza è piena; a 240 s gli addetti escono per dormire; a 270 s il raccolto è zero. Con Sempre il raccolto compare, ma nessuno dorme. Questa prova identifica il difetto; non dimostra una campagna dall'inizio.

La fonte richiede che gli slot si svuotino **temporaneamente** quando gli addetti escono per mangiare o dormire (righe 2150–2160) e che chi non ha un turno notturno torni al riposo (1275). Il rapporto istantaneo resta `Wattivi / Wmax`. La decisione A-34 precisa come contabilizzarlo per un prodotto consegnato una volta a stagione: si accumula soltanto il tempo realmente lavorato, con un turno ordinario di 60 secondi come riferimento. Un campo senza lavoro non riceve un raccolto per la sola presenza di un ordine al confine stagionale.

Non sono aumentati il coefficiente base delle nascite, l'intervallo fertile o la durata della vita. Non sono introdotti immigrati o parti multipli. La crescita continua a richiedere cibo, riposo e spazio negli alloggi.

## Nuovi blocchi emersi nel replay

**Fuga riattivata da una vecchia ferita.** Un ordine pubblico di Cuocere consumava una carne, ma il tick successivo lo annullava anche a casa, senza attacchi. Il controllo usava per sempre l'ultima causa di danno. La fonte (1832–1834) richiede invece un nuovo danno da combattimento: ora un impulso reale viene consumato una volta sola, prima di cura e priorità, e la fuga prosegue fino alla tana. Fame, gelo e Legge Marziale conservano la precedenza. La stessa revisione collega Pericolo soltanto a nuove ferite animali viste da un alleato entro 20 metri (641), anziché a ferite storiche.

**Manutenzione che cancellava il lavoro precedente.** Con due addetti e un capo, il recinto maturava un turno completo in inverno. Se a 360 s mancavano cinque vegetali, veniva spento prima di accreditare la carne e le pelli. La fonte (2175) dice che l'inattività riguarda la stagione successiva. La correzione conserva efficienza e bonus già maturati prima di regolare la manutenzione: il turno pieno rende venti carni e cinque pelli, poi il recinto resta inattivo. Un turno dimezzato rende la metà; un recinto già inattivo non ottiene lavoro retroattivo quando paga. I costi restano prima del deperimento delle scorte vecchie e i raccolti freschi dopo.

**Carico sovrascritto da un nuovo incarico.** Un portatore raccoglieva tre legna, ma se riceveva Portare Pietra durante il ritorno il nuovo carico cancellava quello precedente. La riproduzione isolata partiva da venti legna: diciassette sull'albero e tre in viaggio; dopo il nuovo raccolto restavano soltanto le diciassette. Ora l'ordine sostitutivo lascia le tre legna sul terreno, nelle coordinate reali del portatore, e solo una consegna successiva aumenta le scorte (A-35). I rifiuti per grammatica, voce, materiali, bersaglio o turno non interrompono il viaggio. I lavori rispettano competenze, capienza e completamento degli edifici; un'assegnazione interamente fallita non consuma voce. Costruzioni e lavorazioni di gruppo interrompono soltanto l'esecutore effettivo.

**Salvataggio rifiutato fra due aggiornamenti.** Il browser ha rivelato un timer di vagabondaggio negativo su una persona inattiva. Il salvataggio veniva scritto, ma il validatore lo rifiutava al caricamento. La riproduzione parte dall'inizio senza fixture: tick di 0,173 s, timer a −0,14779 dopo 9,515 s. Ora il conto alla rovescia si ferma a zero. Il caricamento recupera anche il caso storico circoscritto a un'unità inattiva senza comando, con timer fra −0,25 e zero; non accetta lavoro negativo o altre strutture invalide. Una regressione verifica il salvataggio a ogni tick ordinario e mantiene le prove contro gli import corrotti.

## Custodi visibili

Gli avvisi derivano dalle parole vive e dai loro custodi effettivamente vivi. Escludono le parole innate. La mappa distingue la voce dell'ultimo custode dalla Scintilla; il pannello segnala età avanzata, ferite, fame, freddo o uno scontro pericoloso.

Nomi e numeri seguono le conoscenze della tribù. La trasmissione usa l'insegnamento esistente: richiede un Falò proprio attivo e completo, Attenzione e un allievo ammissibile. Una lezione può creare un secondo custode anche quando la ritenzione è già piena. Non esiste un racconto gratuito che assegni parole o salti il rendiconto stagionale.

## Limiti della verifica

Il replay riusabile `tests/scenarios/ordinaryGrowth.ts` parte dal Seed Zero e usa soltanto comandi pubblici, Scintille reali e insegnamento pagato. Il suo primo anno è verificato nel test del motore: 396,25 s, cinque superstiti, diciassette parole vive e due lezioni pagate. Prima della correzione dei carichi, i commit `667cf89` e `9a93958` producevano 395,25 s e sei superstiti con gli stessi comandi; quel confronto è storico, non l'esito della versione corrente. Selezionando un Falò acceso, la mappa mostra anche il raggio fisico del calore e la scheda avverte se il giaciglio non è completamente coperto; il focolare spento resta distinto. Il raggio numerico compare solo con Numero. Lo stato finale rimane fragile: sopravvivere al primo inverno non certifica un'economia sostenibile. I test con campi e persone preparati restano prove isolate dei turni e della contabilità.

Le soglie di 35 e 150 abitanti e le tre vittorie restano aperte finché una rotta ordinaria riproducibile non le raggiunge. Il superamento dei test sui singoli meccanismi non viene usato per dichiararle dimostrate.

Una seconda rotta sperimentale, anch'essa senza modifiche allo stato, costruisce Falò al centro del giaciglio, Deposito e Casa prima dell'inverno. A 420 s mantiene sei abitanti e diciannove parole. L'estensione si arresta a 592,75 s per coesione esaurita: le scorte e l'insegnamento restano insufficienti. Il riparo non protegge le cacce fuori dal suo raggio e, durante la tormenta, la temperatura segue ancora la formula della fonte. Questo esperimento aiuta a distinguere gli errori di strategia dai difetti del motore; non dimostra una crescita sostenibile.

Verifica della revisione: **620 test unitari e di integrazione in 23 file**, **25 prove nel browser**, build e formattazione superati. Le prove comprendono 24 casi sui turni, 8 sui custodi, 19 su fuga e danno osservato, 4 sulla produzione al cambio di manutenzione, 21 sui carichi interrotti e 15 sui salvataggi annidati. Le prove del browser comprendono i nuovi tab, gli ordini touch realmente pagati e il pinch dopo mouse hover: un puntatore inattivo non resta più registrato fra le dita attive. Un nuovo ordine impartito nell'interfaccia verifica anche la caduta del carico e la selezione del cumulo risultante.
