# Tribù e consultazione mobile 0.3.7

Su cellulare Tribù e Pensiero sospendono la simulazione mentre sostituiscono la mappa. Tornando alla mappa il tempo riprende soltanto se era attivo. La sospensione non modifica la scelta di pausa del giocatore: conserva anche le pause di sicurezza, per esempio quando il browser passa in secondo piano. Il tempo trascorso leggendo non viene recuperato alla ripresa. Nel layout desktop, dove la mappa rimane visibile, la simulazione continua normalmente.

Nell'elenco della tribù i dettagli si aprono dentro la scheda selezionata. Una sola persona è espansa alla volta; un secondo tocco sulla sua intestazione la richiude. Il comando di chiusura riporta il focus all'intestazione. I pulsanti dei dettagli restano separati dal pulsante di apertura, senza controlli interattivi annidati.

Salute e fame sono visibili in ogni riepilogo, con icone, parole e segnalazione degli stati urgenti. Prima di Numero restano qualitative; dopo la scoperta usano le stesse descrizioni con i valori previsti dal gioco. La descrizione accessibile del pulsante include entrambi gli stati. Il freddo mantiene il proprio avviso distinto. Incarico, destinazione, caratteristiche, crescita e memoria custodita restano consultabili nella scheda espansa.

Le regressioni verificano la sospensione durante entrambe le sezioni e i dialoghi aperti da esse, la ripresa senza recupero del tempo, la pausa manuale, il passaggio del browser in secondo piano e il cambio fra layout mobile e desktop. Le prove delle schede coprono 320 px con testo grande e contrasto alto, 390 px e desktop, apertura, cambio persona, chiusura, focus e assenza di overflow.

- [Scheda espansa, 390 px](images/ui037-member-390.png)
- [Scheda espansa con testo grande, 320 px](images/ui037-member-320.png)
