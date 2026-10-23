# Un inizio leggibile, con due ritmi di gioco

La prova del giocatore ha evidenziato due problemi distinti: poco margine per preparare il primo inverno e cambiamenti nella tribù difficili da riconoscere. Su scelta dell'utente, le nuove partite propongono **Guidata**, mentre **Classica** conserva il bilanciamento precedente del progetto. I vecchi salvataggi senza modalità restano Classici.

## Calibrazione autorizzata

| Regola                          | Guidata                                                       | Classica                                              |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Scoperta di Qui                 | Una notte effettiva insieme                                   | Due notti effettive insieme, come A-32                |
| Età iniziale di Uma             | Dodici stagioni                                               | Quattordici stagioni                                  |
| Portare Legno, Pietra, Minerale | Ripete i viaggi sul bersaglio scelto durante il giorno        | Un viaggio per ordine                                 |
| Scheggiare Pietra per utensili  | Ripete le lavorazioni, pagando una pietra reale per ciascuna  | Un utensile per ordine                                |
| Primo Falò                      | Al giaciglio, con cinque legna realmente disponibili al campo | Accensione nella posizione dell'artigiano, come prima |
| Tormenta invernale              | Assente nel primo inverno; probabilità del 15% dal secondo    | Probabilità del 15% già dal primo inverno             |
| Durata stagioni, fame, calore   | Stessi valori della simulazione                               | Stessi valori della simulazione                       |
| Portata dei materiali locali    | Quindici metri                                                | Quindici metri                                        |

I compiti ripetuti terminano quando mancano materiali o spazio, arriva il riposo ordinario, intervengono necessità vitali, divieti o un nuovo ordine. Un trasporto già carico completa la consegna. La ripetizione non diventa una tradizione per il giorno successivo. Lance, cucina, cibo e costruzioni rimangono singoli: il gruppo non consuma automaticamente tutte le risorse per fabbricarli. Ogni ciclo aggiuntivo paga il proprio materiale, senza un nuovo costo Voce.

Non si prelevano materiali lontani aumentando il raggio a trentacinque metri. Portare compie il viaggio effettivo. La creazione del Falò guidato non sottrae legna lasciata presso un artigiano lontano dalla tana.

Il rinvio della tormenta è una calibrazione esplicita della Guidata, indicata nella scelta della modalità. La prova ordinaria sul seed 12 aveva sette vivi e Falò acceso all'inizio dell'inverno, ma la tormenta portava all'estinzione entro la primavera. Una risposta tentata sul seed 17 raccoglieva davvero le pietre per una casa, ma il gelo interrompeva il cantiere iniziato troppo tardi. Questo non dimostra che preparare una casa prima sia impossibile: evita che il primo apprendimento dipenda già da quella preparazione. Il tiro casuale viene comunque consumato, preservando il seguito della sequenza; dal secondo inverno il rischio e le equazioni del freddo sono quelli ordinari. La Classica e i vecchi salvataggi senza modalità conservano il rischio iniziale.

## Che cosa fa Portare

Portare può prelevare da un cumulo già estratto oppure estrarre direttamente dall'albero o dalla roccia e riportare il materiale alla tana. Senza bersaglio esplicito, sceglie il candidato compatibile più vicino: non applica una priorità generale ai cumuli. Colpire lascia invece il materiale sul terreno. Gli animali vivi devono essere abbattuti prima di trasportarne la carne; le bacche e le carcasse possono essere raccolte direttamente.

Un ordine nuovo interrompe il compito e lascia il vecchio carico sul posto (A-35). Le risorse consegnate aumentano le scorte solo all'arrivo.

Un cumulo può contenere più frammenti prodotti da cicli di estrazione separati. Trasporto e mappa riconoscono lo stesso cumulo fisico: il carico si riempie prelevando da quei frammenti, senza spostarsi a un altro deposito o scavare la sorgente rimasta. Se un compagno esaurisce il frammento selezionato, gli altri continuano sui pezzi dello stesso materiale e nella stessa posizione. La Classica conserva un solo viaggio; la Guidata può ripeterlo. Le prenotazioni degli altri trasportatori e i limiti effettivi del magazzino continuano a valere.

La capacità di un manufatto considera lo spazio liberato dagli ingredienti già in magazzino: trenta pietre possono diventare ventinove pietre e un utensile. Gli ingredienti a terra non liberano posti nel magazzino. Se una consegna riempie lo spazio durante una lavorazione già pagata, il manufatto finito cade presso l'artigiano e resta recuperabile.

È collegato anche il flag `Eat_Only_When_Hungry` previsto dalla fonte per Conservare: in entrambe le modalità, dopo la scoperta i pasti autonomi terminano sotto la soglia istintiva di fame sessanta. Questo vale anche per il pasto automatico dopo una caccia. Un ordine esplicito di Mangiare, comprese le tradizioni, conserva invece la sazietà completa prevista dalla sua frase. Un foraggiatore ancora vicino alla tana controlla le scorte effettivamente consegnate prima di partire verso un vecchio bersaglio lontano; non consuma a distanza né aggira i divieti alimentari. Nutrimento, incremento della fame e razioni restano invariati.

## Vita e memoria visibili

Entrambe le modalità mostrano sesso e fase di vita osservabili, distinguendo neonati, bambini, adulti e anziani sulla mappa e nell'elenco. I bambini possono imparare ma restano esclusi dai lavori fisici, anche se molto intelligenti. Nomi propri e quantità precise conservano i rispettivi requisiti di Io e Numero.

Le nascite conservano sesso, nome e identificativi dei genitori reali. Le coppie fertili sono maschio/femmina; la probabilità, la sazietà, il riposo e gli alloggi mantengono le formule precedenti. La fonte specifica i ruoli femminili di Nara e Tala e quello maschile di Oru. L'identità degli altri quattro personaggi e i nomi dei neonati sono decisioni del progetto, non ulteriori dati attribuiti al DOCX. I vecchi salvataggi ricevono un'identità stabile senza tiri casuali durante il caricamento.

Nascite, morti e parole perdute hanno una storia persistente, avvisi in primo piano e un riepilogo al Falò. Gli avvisi spiegano la causa nota e le parole effettivamente perdute; Mostra centra la posizione sulla mappa. Una morte che spiega già le proprie perdite non genera un secondo avviso duplicato. Leggere una pagina non chiude gli eventi ancora nascosti nelle successive.

I lutti distinguono tutte le parole custodite dalle sole parole perdute: quelle affidate anche ad altri restano esplicitamente indicate. Una ferita letale conserva l'attaccante reale — lupo, predatore alfa, mammut, aggressore umano o esercito — senza attribuire a una vecchia ferita una successiva morte di fame o freddo. I nuovi campi sono facoltativi nei salvataggi precedenti.

La nascita ha anche l'etichetta temporanea «Nuova vita» sulla mappa; il conteggio «+1» richiede Numero. Il pannello «La prossima generazione» e i dettagli individuali spiegano i requisiti reali di cibo, riposo, ritorno al campo, partner, alloggi e celibato. La previsione considera l'età al prossimo cambio di stagione: condizioni favorevoli non garantiscono una nascita. Un alloggio incompleto non aggiunge posti disponibili.

Selce impugnata, lancia con punta legata, lama e protezione metallica hanno disegni distinti e usano la stessa assegnazione della simulazione. Un utensile non accelera più raccoglitori contemporaneamente né può servire nello stesso momento anche un combattente. Un kit metallico e una lancia equipaggiano due combattenti distinti. Chi non ha strumenti assegnati resta a mani vuote; durante Scheggiare si vede la pietra già pagata in lavorazione.

L'indicatore generale della tribù segnala anche una singola persona che gela, soffre fame estrema o ha ferite gravi: una media favorevole non mostra più «Al sicuro» in questi casi. La guida iniziale dà priorità alle necessità vitali e chiarisce che il solo giaciglio non produce calore.

La Guardia del Fuoco mantiene il proprio incarico durante la notte e riprende come guardia, anche nei vecchi salvataggi che la registravano come lavoro generico. Fame, tabù, leggi, turni condizionali e nuovi ordini continuano a interromperla. Un focolare spento si riaccende pagando legna reale; nessuna riaccensione gratuita deriva dal ripristino dell'incarico.

Una parola appresa e poi perduta resta visibile come tassello spento, inutilizzabile, con causa e invito a ricreare l'esperienza. Non sblocca grammatica, ricette o progressione. La pausa automatica su Scintille ed eventi della tribù è facoltativa e configurabile all'inizio e nelle impostazioni; le nuove Guidate la propongono attiva.

## Prova ordinaria dell'apertura

`tests/scenarios/guidedOpening.ts` parte dal Seed Zero 6842 in Guidata e usa soltanto API del giocatore, vere Scintille e risorse estratte e consegnate. Le decisioni vengono prese ogni cinque secondi: nessun isolamento individuale né posizionamento al decimale.

Con nove ordini di gruppo accende il Falò al centro del giaciglio a **180,25 secondi**, mantiene **sette persone vive** e **6,4 legna** di riserva: restano **89,75 secondi** prima dell'inverno. Il test richiede accensione entro 210 secondi, massimo dieci ordini, combustibile residuo e salvataggio valido.

Questa prova dimostra il margine per il primo Falò. Non dimostra un'intera economia invernale sostenibile: durante il gelo serve nutrimento e contro le tormente occorrono anche ripari o vestiti. Le campagne fino a trentacinque e centocinquanta abitanti restano nel registro delle verifiche aperte.

## Prova del primo anno intero

`tests/scenarios/guidedFirstYear.ts` estende la verifica a **390 secondi**, usando soltanto azioni pubbliche: estrazione, trasporto, lavorazione, pasti, guardia del fuoco, esplorazione effettiva di una pianura e insegnamenti pagati. I bersagli alimentari dell'esplorazione sono indicati solo dopo che le persone li hanno raggiunti e resi visibili. Non prepara inventari, conoscenze, posizione dell'artigiano o tiri casuali.

Cinque prove coprono i seed 6842, 1, 42 e 12, più una partenza e raccolta del cibo ritardate di dieci secondi sul 6842. Ogni percorso usa **tredici ordini di gruppo a decisioni distanziate di dieci secondi**, senza selezioni individuali né isolamento. Il Falò nasce fra **125,75 e 140 secondi**; sono pagati **tre insegnamenti**. Durante l'inverno, ai secondi 270 e 330, il fuoco resta acceso.

| Partita                                 | Vivi a 390 s | Coesione | Legna residua |
| --------------------------------------- | ------------ | -------- | ------------- |
| 6842                                    | 7            | 73       | 5,82          |
| 6842, esplorazione e raccolta ritardate | 8            | 100      | 5,82          |
| 1                                       | 6            | 73       | 2,39          |
| 42                                      | 7            | 92       | 2,30          |
| 12                                      | 7            | 92       | 2,39          |

Le sole morti di questi percorsi sono di vecchiaia. La variante ritardata conserva tutti e sette i personaggi iniziali e ottiene una nascita reale. Il primo inverno usa la protezione climatica esplicita della Guidata; tre prove separate verificano tiro preservato, rischio dal secondo inverno e Classica/salvataggi precedenti. Una tempesta della primavera successiva spegne correttamente il Falò sul seed 1: la prova non lo dichiara protetto oltre l'inverno.

Questa verifica supera la sola prima accensione e include cibo consegnato e trasmissione delle parole. Alla fine dell'inverno il cibo è esaurito e la fame alta: occorre rifornirsi nella nuova primavera. Non dimostra un'economia sostenibile per più anni, una strategia contro le tormente successive o la crescita fino a trentacinque e centocinquanta abitanti.

`guidedOrders.test.ts`, `demography.test.ts`, `unitReadability.test.ts` e `TribeEvents.test.ts` isolano gli altri comportamenti. Le prove browser verificano eventi reali, ricaricamento, modalità, pausa opzionale, tasselli perduti, riepilogo e leggibilità mobile.
