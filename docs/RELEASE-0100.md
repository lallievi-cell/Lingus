# Mondo a regioni — 0.10.0

La nuova scelta **Mondo** estende la geografia a quattro chilometri per lato, mantenendo la simulazione locale da un chilometro. Due grandi terre, cinque isole e un bacino interno condividono coste e fiumi continui fra regioni. Casuale, Seed Zero e i salvataggi precedenti conservano le proprie regole.

## Atlante e trasferimenti

L’Atlante mostra sedici regioni e rivela soltanto i territori visitati. È possibile osservare una regione nota senza muovere le persone. Il viaggio verso un vicino prepara **Gruppo · Andare · Qui**, senza eseguirlo o consumare Voce; **Pronuncia** impartisce l’ordine ordinario.

Il viaggio richiede le parole note e tre spazi di pensiero: all’apertura l’Atlante può essere consultato, mentre la preparazione spiega le capacità ancora mancanti.

I compagni raggiungono il confine a piedi o a bordo di una barca. Il passaggio avviene soltanto all’arrivo fisico e conserva identità, bisogni, carichi e stiva. L’interruzione dell’ordine annulla il trasferimento. Le scorte del campo non vengono copiate nella destinazione. Il primo arrivo sulla terraferma stabilisce un bivacco, senza alloggi gratuiti.

Le regioni lontane già generate continuano a consumare, produrre e invecchiare con un solo calendario e una sola riserva di Voce. Leggi, dogmi e memoria avanzano globalmente una volta; azioni fisiche e pagamenti usano persone e materiali della loro regione.

## Persistenza e compatibilità

`mapGeneration.worldRules: 1`, `worldSeed`, `regionX` e `regionY` identificano il nuovo profilo e richiedono tutte le precedenti regole regionali e marittime. `world.version: 1` conserva griglia, regione osservata, archivi fisici e trasferimenti in corso. I dati della regione attiva esistono una sola volta; gli archivi non contengono copie annidate del mondo o del calendario.

La validazione controlla inventari, identità, equipaggi e continuità fisica del passaggio, anche quando la destinazione non è ancora generata. Il seed geografico resta distinto dal generatore evolutivo della simulazione. L’importazione di una partita precedente non aggiunge regioni o cambia le sue impronte geografiche.

Se lo spazio del browser non basta, il salvataggio riduce le copie automatiche più vecchie e segnala la riduzione. La copia della partita precedente e le storie archiviate restano protette; se non c’è spazio sufficiente, l’errore rimane visibile e non viene dichiarato un salvataggio riuscito.

## Interfaccia mobile

È inclusa la modifica dell’utente che mantiene la mappa libera: selezionare un elemento conserva la scheda chiusa e **Info** nella toolbar apre i dettagli. La risorsa scelta per un trasferimento della barca persiste quando la scheda viene chiusa. Il cambio regione ripulisce selezioni e riferimenti della vista precedente.

## Limiti e verifiche

La topologia principale è una prima struttura comune con dettagli derivati dal seed. Le culture iniziali restano otto; non vengono create altre società gratis nei nuovi continenti. I trasferimenti mondiali riguardano compagni della tribù ed equipaggi; eserciti, contingenti cittadini, carovane e commercio navale autonomo restano successivi.

Le verifiche tecniche coprono geometria condivisa, percorsi, generazione pigra, identità, carichi, annullamenti, salvataggi, calendario e memoria. Le campagne ordinarie prolungate e il bilanciamento delle spedizioni sono rimandati su richiesta. I conteggi della 0.9.0 non certificano questa nuova versione.

La verifica locale mirata dell’integrazione comprende 126 casi del motore; la gestione dei salvataggi ha 21 casi, inclusi quattro sulla quota. Quattro casi browser controllano apertura del Mondo, Atlante e preparazione del viaggio a 320 e 1.440 pixel, con Chromium scaricato 156.0.8078.4. Non sostituiscono una campagna ordinaria fino alla navigazione.

- [Atlante sul desktop](images/ui0100-atlas-1440.png), all’apertura con geografia ancora sconosciuta.
- [Viaggio preparato sul telefono](images/ui0100-travel-320.png), in una scena tecnica con Qui e tre spazi di pensiero già disponibili.
