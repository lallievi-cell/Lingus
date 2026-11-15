# Lingus 0.7.1 — Prova degli ordini riproducibile

La verifica desktop di selezione rapida, cronologia e tastiera usa ora una mappa con seed esplicito `518`, che riproduce la sovrapposizione di due alberi e sceglie il bersaglio attraverso le interazioni pubbliche, inclusa la scelta «Punto sul terreno» quando più elementi si sovrappongono. Controlla che la mappa recuperi il focus e che gli ordini accettati consumino realmente Voce.

La trace dell’esecuzione GitHub Actions `43278759420`, sul commit `327531611f4e523c5fb0b1252a699ae9bd4c4345`, mostrava un gruppo selezionato ma nessuna destinazione. Il messaggio effettivo era «Scegli un bersaglio sulla mappa, poi pronuncia la frase.»: il test si fermava prima del rifiuto per assenza di adulti atteso alla riga 144, senza raggiungere i comandi da tastiera. Il doppio clic imposta l’ancora degli esecutori; la destinazione richiede una scelta completata. Seed e focus di quella partita non erano registrati nella trace.

Non cambiano le regole del gioco. La correzione non usa clic forzati, tentativi automatici, attese aggiuntive o asserzioni ridotte. Gli esiti delle nuove verifiche e della pubblicazione vanno letti nell’esecuzione della release, separatamente dalle prove storiche della 0.7.0.

Verifica locale della release: 1.660 test unitari in 143 file, 240 casi browser, formattazione e build superati. I casi browser sono stati eseguiti indicando esplicitamente Chrome Headless Shell 156.0.8078.4, scaricato da Playwright 1.64.1; i log storici GitHub provano il download della stessa revisione, ma non il percorso effettivamente avviato.
