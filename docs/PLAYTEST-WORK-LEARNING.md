# Incarichi, caccia e trasmissione delle parole

**Candidato 0.3.3: integrazione in verifica, non ancora pubblicata su main.**

## Dividere il lavoro

Dopo Io, **Tribù → Dividi i compiti** apre l'elenco con selezione multipla e incarichi attuali. Si può scegliere solo chi è senza incarico, tutti gli adulti oppure singoli compagni. **Usa questo gruppo** prepara Gruppo e torna alla mappa: non spende Voce, non esegue ordini e non interrompe nessuno. Il pulsante **Gruppo scelto** permette di rivedere la squadra per le frasi successive. La scelta è uno strumento della sessione, non una nuova parola o una tradizione.

L'anteprima del lavoro indica chi agirà realmente. Una ricetta che paga un solo manufatto o edificio affida il lavoro a un artigiano o costruttore; gli altri mantengono i propri incarichi. Raccolta, trasporto e caccia possono invece coinvolgere la squadra selezionata.

## Continuità e motivi delle interruzioni

In Guidata Portare ripete le consegne durante il giorno, anche per il cibo prima di Conservare. Esaurita una fonte, cerca un'altra fonte compatibile entro venti metri dal punto iniziale, nei settori già esplorati. L'origine rimane fissa anche nei salvataggi precedenti che non avevano questo dato. Non attraversa la regione inseguendo catene di giacimenti. Se il bersaglio iniziale è un mucchio a terra, continua a raccogliere materiale già estratto; non passa di nascosto a minare rocce o tagliare alberi.

Ogni carico viene sottratto alla fonte, trasportato e consegnato prima del successivo viaggio. Nessun aumento di carico, produzione, capienza o velocità è implicito. Fame, freddo, riposo, scorte piene, materiali mancanti, oblio e divieti continuano a interrompere il lavoro. Le Scintille di Legno e Pietra non cancellano l'estrazione Guidata.

Il riepilogo mostra il motivo più recente già da chiuso. Il lavoratore conserva l'esito anche dopo il salvataggio. I motivi vengono rilevati dopo ogni passo interno della simulazione, così un pasto successivo non nasconde una precedente interruzione per fame. Un nuovo incarico accettato sostituisce l'esito precedente. Preparare di nuovo una frase resta distinto dal pronunciarla e pagarla.

## Caccia

La fauna non viene ricollocata istantaneamente al proprio punto d'origine. Passeggio, fuga e ritorno rispettano la velocità e il tempo trascorso anche ai bordi della mappa e con identificatori non numerici. L'ingaggio dipende da cacciatori vivi ancora impegnati su quella preda, sia per ordini diretti sia per tradizioni. Annullare la caccia lascia nuovamente libero l'animale. Danni, velocità e portata delle armi conservano i propri valori.

## Racconti e custodi

In Guidata dieci punti Attenzione finanziano un racconto. Con un solo custode impara una persona; con due custodi possono imparare due persone, fino a tre coppie contemporanee. Le coppie aggiuntive richiedono insegnanti già custodi e allievi vicini allo stesso Falò acceso. I bambini mantengono la priorità; gli adulti sotto la soglia già prevista possono imparare.

Una parola può così passare da uno a due, poi a quattro e fino a sette custodi in tre racconti, se le persone sono idonee e raccolte al fuoco. I nuovi allievi non insegnano nello stesso racconto. L'anteprima e il piano di lezioni elencano gli allievi effettivi prima della spesa. Ogni allievo ha la propria estrazione deterministica e registrazione; memoria e investimento vengono rinforzati una sola volta per racconto. La Classica mantiene l'allievo singolo.

## Ritmo delle intuizioni

La Guidata presenta fino a due Scintille alla volta. Nelle prime otto stagioni lascia venticinque secondi simulati tra due intuizioni facoltative; la sequenza di sopravvivenza ha precedenza e può essere presentata appena si libera uno spazio. Le altre esperienze mature restano in coda, visibili come **Intuizioni da approfondire** in Pensiero. Non producono pause, suoni o pulsanti prima della presentazione.

La coda conserva un'esperienza realmente maturata, il suo testimone e la ricetta, non una promessa di parola gratuita. Per essere presentata richiede ancora un testimone vivo e una ricetta utilizzabile. Il termine di quarantacinque secondi decorre dalla presentazione; il tempo d'attesa non brucia l'intuizione. Anche dopo le otto stagioni lo svuotamento conserva il limite di due Scintille visibili. I salvataggi precedenti e le Scintille già visibili mantengono i propri tempi.

## Verifica

Le prove mirate controllano caccia diretta e persistente, movimenti limitati, conservazione dei materiali, fonti vicine e lontane, scorte condivise, riposo e bisogni, salvataggi precedenti, motivo dell'interruzione indipendente dalla suddivisione del tempo, coppie reali d'insegnamento e relativi costi e RNG, coda delle intuizioni, anteprime pure e selezione gratuita delle squadre. Gli scenari preparati di interfaccia e apprendimento non costituiscono una dimostrazione di campagna ordinaria fino alle città o alle vittorie.

Le 91 prove browser, comprese le nuove squadre e la coda delle intuizioni, passano. Le aperture su mappe casuali e la transizione preparata da 35 abitanti a una città sono state ricontrollate. Restano in regressione le due campagne continue in `continuousCampaign.test.ts`: le partite non raggiungono più i propri orizzonti con tutti i vincoli precedenti. La causa e l'effetto sul bilanciamento restano da risolvere. Non sono stati abbassati i requisiti di crescita o sopravvivenza per ottenere un risultato verde. La versione candidata resta su un ramo separato finché queste regressioni non sono risolte e l'intera suite non passa.

Risultati finali di questo candidato: **1.448 test superati e 2 falliti** in 113 file; **91 prove browser superate**; TypeScript, formattazione, build e prova della build compilata sotto `/Lingus/` validi. I due fallimenti sono le campagne del seed 6842: il replay legacy si interrompe a 2037,25 s anziché raggiungere 2700 s; il replay Guidato nuovo si interrompe a 1250,5 s anziché raggiungere 2040 s. Entrambe terminano per esaurimento della Coesione. Il dettaglio riproducibile è in `src/game/continuousCampaign.test.ts`; gli obiettivi di popolazione, nascite, sopravvivenza e risorse non sono stati ridotti.
