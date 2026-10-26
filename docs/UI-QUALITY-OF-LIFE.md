# Leggibilità, ordini e preparazione

Questa revisione implementa i cinque interventi UX autorizzati dopo la prova del giocatore. Le informazioni descrivono la partita corrente; non aggiungono risorse, conoscenze, produttività o bonus alle modalità.

## Anteprima degli ordini

Dopo almeno due parole compare una riga espandibile nella barra. `getOrderPreview` interroga `issueCommand` sulla sua normale copia profonda dello stato, senza avanzare il tempo. Una ricevuta facoltativa registra gli individui effettivamente assegnati nei rami del motore: un artigiano o costruttore resta un solo esecutore anche quando il soggetto è Gruppo. La ricevuta non fa parte del salvataggio e non modifica l’esito del comando.

La scheda mostra esecutori, destinazioni effettive, costi immediati, attività sostituite e carichi lasciati sul terreno. Leggi, dogmi e tradizioni passano attraverso le verifiche reali. Un tentativo respinto che comporterebbe sanzioni viene segnalato. La partita viva rimane invariata, inclusi generatore casuale, Voce, memoria e incarichi.

Le spiegazioni distinguono estrazione e consegna, Colpire e Portare, compito diretto e istituzione, Guidata e Classica. La ripetizione di Portare e la lavorazione ordinaria della selce usano gli stessi predicati della simulazione. Aprire una scheda con Invio o Spazio mantiene l’attivazione nativa del controllo e non pronuncia la frase.

## Persone, edifici e incarichi

Le persone mostrano osservazioni della macchina di stati: senza incarico, in consegna, in viaggio alla postazione, al lavoro, in recupero, incarico salvato in pausa. Non viene inventata la causa storica di un ordine ormai concluso. I bambini continuano a indicare esplicitamente che possono imparare e non lavorano.

Le schede degli edifici distinguono assegnati, presenti e produttivi, persone con incarico sospeso, lavori incompleti, inattività, bestiame assente e input mancanti nelle fonderie. La produzione urbana usa le coorti e il rendimento osservato della stagione precedente, senza presentarlo come produzione istantanea. «Prepara incarico» ricompone la frase conosciuta e seleziona la postazione: l’ordine viene inviato soltanto con Pronuncia.

Filtri e ordinamento sono raccolti in «Filtri e priorità» per lasciare spazio alle persone. Si possono combinare condizioni osservabili e attività, trovare gli ultimi custodi e ordinare prima le urgenze. Le schede individuali selezionate precedono l’elenco; Mostra destinazione e Inquadra consentono di raggiungere il luogo interessato. I filtri sono locali all’interfaccia e si azzerano quando si cambia partita.

## Preparazione stagionale

Il pannello è accessibile anche dal pulsante con la foglia accanto ai controlli del tempo, compreso il telefono.

- Riserva le manutenzioni dovute **alla chiusura della stagione corrente**, nell’ordine effettivo degli edifici. Considera materiali provinciali, tesoro comune e legna già a terra entro il raggio reale dei falò. Esclude strutture straniere, distrutte o incomplete.
- Applica alle scorte residue il marciume della stagione che termina, con conservazione e ceramica. Mostra un’autonomia teorica usando soltanto vegetali e cibo cotto, la popolazione attuale e il consumo ordinario con il modificatore delle leggi. La confronta con il tempo restante più tutta la prossima stagione.
- Segnala separatamente il rischio della carne cruda e il fabbisogno vegetale dei recinti a fine inverno. La scorciatoia di cottura usa la vera frase a quattro parole, compreso Fuoco.
- Valuta il calore nel punto del giaciglio durante la normale notte della prossima stagione, usando raggi reali, pelli, edificio più vicino e manutenzioni pagabili. Non applica una copertura termica fittizia agli alloggi.

Sono stime per decidere, non promesse di sopravvivenza: non prevedono raccolti futuri, consegne, morti, nascite, cambi di regole o nuovi disastri. La manutenzione mostrata riguarda gli edifici; il mantenimento dei battaglioni è escluso e viene segnalato esplicitamente quando ci sono truppe proprie, con un collegamento alla mappa. Il movimento fuori dai raggi di calore, le diete, l’accesso alle scorte e gli sprechi dei pasti restano rilevanti. Prima di Numero si usano descrizioni qualitative.

## Avvisi e selezione sulla mappa

Le notifiche permettono di inquadrare un evento, aprire la scheda di una persona viva e consultare l’esperienza di una parola perduta. Il pannello della parola distingue l’esperienza da rivivere dalla ricetta da ricomporre nella Scintilla; i concetti attualmente ignoti restano nascosti. Nessun pulsante ripristina gratuitamente una parola. Dal riepilogo stagionale si può ispezionare la mappa senza concludere il consiglio: il tempo rimane fermo, gli ordini attendono e «Torna al consiglio» riapre l’insegnamento prima della normale chiusura e del decadimento.

Quando le sagome selezionabili si sovrappongono, la mappa offre una scelta esplicita, compreso il terreno sottostante. Le parti di una stessa sagoma vengono deduplicate e gli elementi nascosti dalla nebbia non entrano nella scelta; le coordinate degli elementi in movimento vengono ricontrollate prima di mostrarli e selezionarli. Anche l’anteprima lascia anonime le destinazioni non esplorate. La selezione non esegue ordini. Tastiera, Escape, clic esterno e touch sono supportati; trascinamento, pinch e selezione del centro del gruppo mantengono i propri gesti.

## Prove

Verifica finale: **1.017 test unitari e di integrazione in 72 file e 84 prove nel browser**, compresi 26 nuovi controlli dei modelli e 12 nuovi casi di interfaccia. Build e formattazione verificate.

`orderPreview.test.ts`, `workDiagnostics.test.ts` e `seasonReadiness.test.ts` coprono ricevute, immutabilità, costi, incarichi reali e sospesi, province, manutenzione annuale, conservazione, carburante locale e calore. `quality-of-life.spec.ts` verifica nel browser preparazione senza spesa, esecuzione successiva, filtri, perdita reale di una parola, conoscenze iniziali, tastiera, mobile e selezione fra persone sovrapposte. Queste sono prove di UI e sistemi isolati; le campagne complete restano documentate separatamente.
