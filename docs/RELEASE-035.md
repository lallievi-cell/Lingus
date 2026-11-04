# Correzioni 0.3.5

## Pubblicazione su GitHub Pages

La suite completa aveva otto test che salvavano schermate in `/workspace/artifacts`, un percorso dell'ambiente di sviluppo. Sul runner GitHub il repository si trova altrove e i test non devono creare directory alla radice del sistema. I casi coincidono con gli otto fallimenti segnalati: custodi, due flussi di navigazione, tre delle risorse, materiali delle sei ere e leggibilità mobile della tribù.

Le immagini vengono ora salvate con `test.info().outputPath()`, nella cartella assegnata da Playwright al singolo test. Anche le immagini precedentemente scritte in `/tmp` seguono questa regola: gli esiti non si sovrascrivono fra test e sono inclusi negli artefatti diagnostici del workflow. Restano attive tutte le verifiche su tocco, memoria, custodi, risorse e salvataggi.

## Fame leggibile

La condizione fisica usa **Sazio/Sazia → Ha fame → Affamato/Affamata → Fame estrema**. Sotto 20 la persona è sazia; da 20 ha fame; da 75 è affamata; da 95 la fame è estrema. Le stesse parole descrivono gli avvisi individuali sulla mappa e nell'elenco della tribù. Dopo la scoperta di Numero, lo stato rimane visibile accanto al valore di fame su 100.

L'indicazione chiarisce che la fame aumenta senza cibo e diminuisce dopo un pasto. Cambia solo la presentazione: nessuna formula, velocità di consumo, soglia di interruzione del lavoro o danno per fame viene modificato.
