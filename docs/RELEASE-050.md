# Una regione più grande — 0.5.0

Le nuove storie su **Mappa casuale** hanno un territorio di **1.000 × 1.000 metri e cento settori**, quattro volte la superficie della valle precedente. Esplorazione, insediamenti e collegamenti possono estendersi oltre i vecchi confini.

Vicino al campo si conserva la scala del lavoro: sette persone, risorse iniziali alle distanze ordinarie e zoom locale al 450%. La regione aggiunge boschi, rilievi, fauna e risorse sul territorio esterno. Le quattro culture esistenti vengono collocate nella geografia più ampia.

La vista urbana parte dal 50% e può scendere al 45%; la minimappa rappresenta l’intero territorio. Selezione, nebbia, notte, percorsi, carichi e colonie rispettano la stessa estensione. I fiumi restano attraversabili a piedi soltanto nei guadi. La cache del terreno conserva un limite di 3.600 × 2.400 pixel, con persone, edifici e risorse disegnati separatamente.

Nella panoramica, le sagome naturali molto piccole usano immagini composte in una cache limitata. Posizioni e quantità restano quelle della simulazione; oggetti selezionati e bersagli di lavoro mantengono il disegno completo. Lo zoom locale conserva le animazioni dettagliate e le ombre continuano a seguire il sole. I nomi delle città rimangono entro i bordi della visuale.

## Riprendere o iniziare

I salvataggi esistenti conservano la valle di **500 × 500 metri e venticinque settori**, senza spostamenti o risorse ricreate. Anche **Seed Zero** mantiene lo scenario originario. Per usare il territorio esteso occorre iniziare una nuova storia casuale; le impostazioni mostrano seed e dimensioni della partita.

Le regioni salvano `mapGeneration.worldSize: 1000`; l’assenza del campo indica ancora cinquecento metri. A parità di dimensioni e seed, la geografia è riproducibile. Il caricamento conserva il mondo effettivamente giocato.

## Verifiche e seguito

Le prove regionali coprono generazione, vincoli delle risorse iniziali, percorsi, interazioni e trasporti oltre i cinquecento metri, colonie e validazione dei salvataggi. Le prove browser esercitano zoom locale, vista urbana, selezione e copertura del territorio.

Il replay dell’apertura Guidata sui seed **1, 42 e 6842**, con stagioni da 150 secondi, ottiene il Falò entro 350 secondi, un utensile pagato e combustibile consegnato, con tutti i sette fondatori vivi. Usa ordini pubblici e bersagli visibili, senza preparare scorte o conoscenze. Questa verifica riguarda l’apertura e non certifica una campagna pluriennale.

Schermate su telefono:

- [Nuova storia nell’interfaccia completa](images/ui050-region-new-story-390.png): avvio ordinario, senza risorse preparate.
- [Panoramica della regione](images/ui050-region-overview-390.png): geografia generata con le quattro città e tutte le entità naturali; epoca urbana e scoperte sono preparate per verificare disegno e leggibilità.

Il prossimo blocco dell’[espansione del mondo](WORLD-EXPANSION.md) riguarda **sei–otto culture autonome**. Seguono ambienti con effetti su insediamenti e lavoro, poi coste, pesca, approdi e navigazione. Questa versione consegna lo spazio fisico regionale; non include ancora quei sistemi.
