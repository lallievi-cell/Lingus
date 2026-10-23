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
| Stagione, inverno, fame, calore | Stessi valori della simulazione                               | Stessi valori della simulazione                       |
| Portata dei materiali locali    | Quindici metri                                                | Quindici metri                                        |

I compiti ripetuti terminano quando mancano materiali o spazio, arriva il riposo ordinario, intervengono necessità vitali, divieti o un nuovo ordine. Un trasporto già carico completa la consegna. La ripetizione non diventa una tradizione per il giorno successivo. Lance, cucina, cibo e costruzioni rimangono singoli: il gruppo non consuma automaticamente tutte le risorse per fabbricarli. Ogni ciclo aggiuntivo paga il proprio materiale, senza un nuovo costo Voce.

Non si prelevano materiali lontani aumentando il raggio a trentacinque metri. Portare compie il viaggio effettivo. La creazione del Falò guidato non sottrae legna lasciata presso un artigiano lontano dalla tana.

## Che cosa fa Portare

Portare può prelevare da un cumulo già estratto oppure estrarre direttamente dall'albero o dalla roccia e riportare il materiale alla tana. Senza bersaglio esplicito, sceglie il candidato compatibile più vicino: non applica una priorità generale ai cumuli. Colpire lascia invece il materiale sul terreno. Gli animali vivi devono essere abbattuti prima di trasportarne la carne; le bacche e le carcasse possono essere raccolte direttamente.

Un ordine nuovo interrompe il compito e lascia il vecchio carico sul posto (A-35). Le risorse consegnate aumentano le scorte solo all'arrivo.

## Vita e memoria visibili

Entrambe le modalità mostrano sesso e fase di vita osservabili, distinguendo neonati, bambini, adulti e anziani sulla mappa e nell'elenco. I bambini possono imparare ma restano esclusi dai lavori fisici, anche se molto intelligenti. Nomi propri e quantità precise conservano i rispettivi requisiti di Io e Numero.

Le nascite conservano sesso, nome e identificativi dei genitori reali. Le coppie fertili sono maschio/femmina; la probabilità, la sazietà, il riposo e gli alloggi mantengono le formule precedenti. La fonte specifica i ruoli femminili di Nara e Tala e quello maschile di Oru. L'identità degli altri quattro personaggi e i nomi dei neonati sono decisioni del progetto, non ulteriori dati attribuiti al DOCX. I vecchi salvataggi ricevono un'identità stabile senza tiri casuali durante il caricamento.

Nascite, morti e parole perdute hanno una storia persistente, avvisi in primo piano e un riepilogo al Falò. Gli avvisi spiegano la causa nota e le parole effettivamente perdute; Mostra centra la posizione sulla mappa. Una morte che spiega già le proprie perdite non genera un secondo avviso duplicato. Leggere una pagina non chiude gli eventi ancora nascosti nelle successive.

Una parola appresa e poi perduta resta visibile come tassello spento, inutilizzabile, con causa e invito a ricreare l'esperienza. Non sblocca grammatica, ricette o progressione. La pausa automatica su Scintille ed eventi della tribù è facoltativa e configurabile all'inizio e nelle impostazioni; le nuove Guidate la propongono attiva.

## Prova ordinaria dell'apertura

`tests/scenarios/guidedOpening.ts` parte dal Seed Zero 6842 in Guidata e usa soltanto API del giocatore, vere Scintille e risorse estratte e consegnate. Le decisioni vengono prese ogni cinque secondi: nessun isolamento individuale né posizionamento al decimale.

Con nove ordini di gruppo accende il Falò al centro del giaciglio a **180,25 secondi**, mantiene **sette persone vive** e **6,4 legna** di riserva: restano **89,75 secondi** prima dell'inverno. Il test richiede accensione entro 210 secondi, massimo dieci ordini, combustibile residuo e salvataggio valido.

Questa prova dimostra il margine per il primo Falò. Non dimostra un'intera economia invernale sostenibile: durante il gelo servono anche nutrimento e ripari o vestiti. Le campagne fino a trentacinque e centocinquanta abitanti restano nel registro delle verifiche aperte.

`guidedOrders.test.ts`, `demography.test.ts`, `unitReadability.test.ts` e `TribeEvents.test.ts` isolano gli altri comportamenti. Le prove browser verificano eventi reali, ricaricamento, modalità, pausa opzionale, tasselli perduti, riepilogo e leggibilità mobile.
