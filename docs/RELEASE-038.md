# Attività leggibili e profondità della valle — 0.3.8

Le schede della tribù indicano la risorsa e la fase del lavoro già quando sono chiuse: per esempio «Va a raccogliere legno», «Raccoglie legno», «Estrae pietra» e «Porta legno al campo». La destinazione deriva dalla posizione di interazione usata dal motore; il trasporto legge il carico effettivo. I materiali sconosciuti restano anonimi e le fonti inesplorate non vengono rivelate. La scheda espansa spiega quando il materiale resta a terra e quando entra nelle scorte.

La valle mantiene la direzione naturalistica esistente e aggiunge:

- Rilievo leggero nel prato, bordi più irregolari della terra battuta e sponde stratificate. Sono dettagli preparati nella cache del terreno, senza nuove risorse o ostacoli.
- Ombre morbide al suolo per vegetazione, rocce e costruzioni rialzate. Seguono la luce del giorno e si attenuano durante le tempeste. Un albero tagliato perde l’ombra della chioma; un giacimento esaurito perde la propria ombra.
- Correnti discrete lungo lo stesso tracciato usato dal disegno del fiume, sia nelle mappe casuali sia in Seed Zero.
- Piccoli frammenti sincronizzati con i colpi su alberi e rocce, e brevi contatti dei piedi durante gli spostamenti osservati. Il carico mostrato continua a essere quello effettivamente trasportato.

Le ombre di contatto delle persone restano ancorate al terreno mentre il corpo oscilla. Gli effetti aggiunti rispettano pausa, movimento ridotto, esplorazione e conoscenza dei materiali. Non modificano ordini, risorse, casualità della simulazione, coordinate o salvataggi.

## Verifica

Le prove delle attività includono un trasporto eseguito dal motore, dal cammino alla raccolta fino al carico, verificando che le scorte non aumentino in anticipo. Le prove dell’interfaccia coprono schede chiuse ed espanse a 390 px e a 320 px con testo grande e contrasto alto.

Le prove grafiche controllano continuità del fiume, corrispondenza con i percorsi generati, pausa, movimento ridotto, conoscenze ed esplorazione, sorgenti esaurite e assenza di mutazioni della simulazione. Le scene artistiche preparate e il confronto di prestazioni non rappresentano una campagna completata né una misura degli FPS su un telefono reale.

Il confronto del renderer usa 36 fonti visibili, una superficie di 390 × 650 px con risoluzione interna doppia, 20 fotogrammi di riscaldamento e 60 campioni con lettura sincrona dei pixel. In Chromium con rendering software, la mediana passa da 16,4 a 17,1 ms con sette persone e da 66,3 a 69,5 ms nella scena volutamente affollata con 150 persone. Il costo aggiuntivo resta contenuto in questa prova; lo scenario più affollato richiede ulteriore profilazione su hardware mobile reale.

## Schermate

- [Risorse e fasi nelle schede chiuse](images/ui038-work-390.png).
- [Accampamento nell’interfaccia del telefono](images/ui038-valley-390.png).
- [Dettaglio del fiume generato](images/ui038-river-390.png).
