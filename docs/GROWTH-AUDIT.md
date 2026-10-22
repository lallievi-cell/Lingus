# Crescita ordinaria e custodi della memoria

Questa revisione prosegue dai commit dell'utente fino a `667cf89`. Conserva il nuovo viewport, il giaciglio senza un Falò già costruito, la distinzione fra fuoco acceso e spento, le due notti necessarie per scoprire Qui e la possibilità di accendere il Falò anche durante l'ipotermia.

## Difetti individuati nei turni

Il problema demografico non si riduce al coefficiente di nascita. Sono stati individuati tre comportamenti che ostacolano la produzione e il riposo:

- Un addetto che esce per dormire o mangiare perde definitivamente il proprio incarico, anziché liberare temporaneamente lo slot.
- Una tradizione Sempre può riassegnare il lavoro durante la notte ordinaria. Anche un tentativo fallito perché tutti i posti sono occupati può impedire l'istinto del sonno.
- La resa stagionale usa soltanto gli addetti presenti alla chiusura della stagione, dopo la notte. Un campo lavorato durante il giorno può quindi produrre zero.

La riproduzione isolata del terzo difetto parte da uno stato dichiaratamente preparato a 235 s: campo con tre addetti, scorte sufficienti e ordine di Semina. A 239 s l'efficienza è piena; a 240 s gli addetti escono per dormire; a 270 s il raccolto è zero. Con Sempre il raccolto compare, ma nessuno dorme. Questa prova identifica il difetto; non dimostra una campagna dall'inizio.

La fonte richiede che gli slot si svuotino **temporaneamente** quando gli addetti escono per mangiare o dormire (righe 2150–2160) e che chi non ha un turno notturno torni al riposo (1275). Il rapporto istantaneo resta `Wattivi / Wmax`. La decisione A-34 precisa come contabilizzarlo per un prodotto consegnato una volta a stagione: si accumula soltanto il tempo realmente lavorato, con un turno ordinario di 60 secondi come riferimento. Un campo senza lavoro non riceve un raccolto per la sola presenza di un ordine al confine stagionale.

Non sono aumentati il coefficiente base delle nascite, l'intervallo fertile o la durata della vita. Non sono introdotti immigrati o parti multipli. La crescita continua a richiedere cibo, riposo e spazio negli alloggi.

## Custodi visibili

Gli avvisi derivano dalle parole vive e dai loro custodi effettivamente vivi. Escludono le parole innate. La mappa distingue la voce dell'ultimo custode dalla Scintilla; il pannello segnala età avanzata, ferite, fame, freddo o uno scontro pericoloso.

Nomi e numeri seguono le conoscenze della tribù. La trasmissione usa l'insegnamento esistente: richiede un Falò proprio attivo e completo, Attenzione e un allievo ammissibile. Una lezione può creare un secondo custode anche quando la ritenzione è già piena. Non esiste un racconto gratuito che assegni parole o salti il rendiconto stagionale.

## Limiti della verifica

Il replay riusabile `tests/scenarios/ordinaryGrowth.ts` parte dal Seed Zero e usa soltanto comandi pubblici, Scintille reali e insegnamento pagato. Il suo primo anno è verificato nel test del motore: 395,25 s, sei superstiti, diciassette parole vive e due lezioni pagate. Un confronto usando la simulazione del commit dell'utente `667cf89` produce lo stesso esito con gli stessi comandi. Lo stato finale rimane fragile: sopravvivere al primo inverno non certifica un'economia sostenibile. I test con campi e persone preparati restano prove isolate dei turni e della contabilità.

Le soglie di 35 e 150 abitanti e le tre vittorie restano aperte finché una rotta ordinaria riproducibile non le raggiunge. Il superamento dei test sui singoli meccanismi non viene usato per dichiararle dimostrate.

Verifica della revisione: **573 test unitari e di integrazione in 20 file**, **20 prove nel browser**, build e formattazione superati. Le nuove prove comprendono 24 casi sui turni e 8 sui custodi.
