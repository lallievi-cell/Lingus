# Incarichi, caccia e trasmissione delle parole

**Versione 0.3.3.**

## Dividere il lavoro

Dopo Io, **Tribù → Dividi i compiti** apre l'elenco con selezione multipla e incarichi attuali. Si può scegliere solo chi è senza incarico, tutti gli adulti oppure singoli compagni. **Usa questo gruppo** prepara Gruppo e torna alla mappa: non spende Voce, non esegue ordini e non interrompe nessuno. Il pulsante **Gruppo scelto** permette di rivedere la squadra per le frasi successive. La scelta è uno strumento della sessione, non una nuova parola o una tradizione.

L'anteprima del lavoro indica chi agirà realmente. Una ricetta che paga un solo manufatto o edificio affida il lavoro a un artigiano o costruttore; gli altri mantengono i propri incarichi. Raccolta, trasporto e caccia possono invece coinvolgere la squadra selezionata.

## Continuità e motivi delle interruzioni

In Guidata Portare ripete le consegne durante il giorno, anche per il cibo prima di Conservare e quando la frase di due parole indica direttamente una fonte sulla mappa. Esaurita una fonte, cerca un'altra fonte compatibile entro venti metri dal punto iniziale, nei settori già esplorati. Una frase senza il nome del materiale resta legata al tipo e alla risorsa della fonte scelta: raccogliere bacche non diventa automaticamente recuperare carcasse. L'origine rimane fissa anche nei salvataggi precedenti che non avevano questo dato. Non attraversa la regione inseguendo catene di giacimenti. Se il bersaglio iniziale è un mucchio a terra, continua a raccogliere materiale già estratto; non passa di nascosto a minare rocce o tagliare alberi.

Ogni carico viene sottratto alla fonte, trasportato e consegnato prima del successivo viaggio. Nessun aumento di carico, produzione, capienza o velocità è implicito. Fame, freddo, riposo, scorte piene, materiali mancanti, oblio e divieti continuano a interrompere il lavoro. Le Scintille di Legno e Pietra non cancellano l'estrazione Guidata.

Di notte un nuovo incarico di raccolta diurno viene rifiutato prima della spesa: l'anteprima spiega di attendere l'alba, la Voce e i compiti precedenti restano intatti. Un carico già in viaggio viene comunque consegnato prima del riposo.

Il riepilogo mostra il motivo più recente già da chiuso. Il lavoratore conserva l'esito anche dopo il salvataggio. I motivi vengono rilevati dopo ogni passo interno della simulazione, così un pasto successivo non nasconde una precedente interruzione per fame. Una fonte fermata dal limite di conservazione del dogma è indicata come **Fonte preservata**, senza chiamare esaurite le risorse ancora presenti. Un nuovo incarico accettato sostituisce l'esito precedente. Preparare di nuovo una frase resta distinto dal pronunciarla e pagarla.

## Caccia

La fauna non viene ricollocata istantaneamente al proprio punto d'origine. Passeggio, fuga e ritorno rispettano la velocità e il tempo trascorso anche ai bordi della mappa e con identificatori non numerici. L'ingaggio dipende da cacciatori vivi ancora impegnati su quella preda, sia per ordini diretti sia per tradizioni. Annullare la caccia lascia nuovamente libero l'animale. Danni, velocità e portata delle armi conservano i propri valori.

In entrambi i modi Portare non preleva carne da animali vivi, neppure con una frase di due parole: prima serve una vera caccia.

## Percorsi automatici prudenti

In Guidata la ricerca autonoma del cibo, il bersaglio scelto automaticamente per Mangiare e i nuovi viaggi ripetuti evitano lupi e alfa visibili lungo andata e ritorno. Il margine di ventiquattro metri comprende i venti metri di ingaggio esistenti e lo spazio fisico attorno alla fonte. Non cambia il raggio d'attacco, non rivela animali inesplorati e non concede cibo. La palizzata protegge solo un viaggio interamente dentro il proprio raggio, compresa la posizione di lavoro accanto alla fonte.

Un raccoglitore consegna il carico effettivo prima di rinunciare al viaggio successivo; il motivo conservato è **Percorso pericoloso**. Un pasto autonomo rivaluta il tragitto mentre si sposta. Un bersaglio scelto esplicitamente dal giocatore mantiene il proprio rischio. La Classica conserva le proprie scelte istintive.

## Racconti e custodi

In Guidata dieci punti Attenzione finanziano un racconto. Con un solo custode impara una persona; con due custodi possono imparare due persone, fino a tre coppie contemporanee. Le coppie aggiuntive richiedono insegnanti già custodi e allievi vicini allo stesso Falò acceso. I bambini mantengono la priorità; gli adulti sotto la soglia già prevista possono imparare.

Una parola può così passare da uno a due, poi a quattro e fino a sette custodi in tre racconti, se le persone sono idonee e raccolte al fuoco. I nuovi allievi non insegnano nello stesso racconto. L'anteprima e il piano di lezioni elencano gli allievi effettivi prima della spesa. Ogni allievo ha la propria estrazione deterministica e registrazione; memoria e investimento vengono rinforzati una sola volta per racconto. La Classica mantiene l'allievo singolo.

## Ritmo delle intuizioni

La Guidata presenta fino a due Scintille alla volta. Nelle prime otto stagioni lascia venticinque secondi simulati tra due intuizioni facoltative; la sequenza di sopravvivenza ha precedenza e può essere presentata appena si libera uno spazio. Le altre esperienze mature restano in coda, visibili come **Intuizioni da approfondire** in Pensiero. Non producono pause, suoni o pulsanti prima della presentazione.

La coda conserva un'esperienza realmente maturata, il suo testimone e la ricetta, non una promessa di parola gratuita. Per essere presentata richiede ancora un testimone vivo e una ricetta utilizzabile. Il termine di quarantacinque secondi decorre dalla presentazione; il tempo d'attesa non brucia l'intuizione. Anche dopo le otto stagioni lo svuotamento conserva il limite di due Scintille visibili. I salvataggi precedenti e le Scintille già visibili mantengono i propri tempi.

## Verifica

Le prove mirate controllano caccia diretta e persistente, movimenti limitati, conservazione dei materiali, fonti vicine e lontane, scorte condivise, riposo e bisogni, salvataggi precedenti, motivo dell'interruzione indipendente dalla suddivisione del tempo, coppie reali d'insegnamento e relativi costi e RNG, coda delle intuizioni, anteprime pure e selezione gratuita delle squadre. Gli scenari preparati di interfaccia e apprendimento non costituiscono una dimostrazione di campagna ordinaria fino alle città o alle vittorie.

Risultati della revisione: **1.467 test superati in 113 file**, **91 prove browser superate**, TypeScript, formattazione, build e prova della build compilata sotto `/Lingus/` validi. Le otto varianti del primo anno comprendono mappe generate e partenze ritardate; restano richiesti raccolta reale, lezioni pagate, capacità conservate e assenza di morti ambientali.

Entrambe le campagne continue del seed 6842 in `continuousCampaign.test.ts` rispettano di nuovo tutti i propri vincoli: trenta stagioni nel profilo legacy fino a 2700 secondi e venti nella nuova Guidata fino a 2040 secondi, con discendenti diventati genitori, alloggi e cibo, nessuna morte ambientale o violenta. La nuova Guidata mantiene le soglie di almeno quindici abitanti, quindici nascite e sessanta Coesione. La transizione da un insediamento dichiaratamente preparato di trentacinque persone verifica separatamente Scrittura, Archivio e una città di almeno centocinquanta entro l'orizzonte di 1720 secondi.

I piloti usano il calendario reale, scorte consegnate e squadre scelte con i controlli pubblici. Non assegnano risorse, persone o parole. L'apertura legacy avvia i turni di raccolta durante il giorno e ritenta i ruoli quando il lavoratore ha consegnato il carico. La nuova Guidata separa cibo, combustibile e artigiano dopo Io; il pasto serale usa un vero ordine di gruppo pagato. Non sono stati ridotti gli obiettivi di crescita, sopravvivenza o costo. È aggiornata un'asserzione ormai incompatibile con il rifiuto preventivo notturno: al posto della raccolta inefficace a 240 secondi, verifica il pasto ritardato reale a 230 secondi e che i trasporti accettati inizino di giorno.

Queste prove limitate non chiudono una campagna ordinaria da sette persone fino a trentacinque, alle città e alle tre vittorie. Tale verifica e i playtest con nuovi giocatori restano in [REMAINING.md](REMAINING.md).
