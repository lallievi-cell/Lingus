# Ambienti funzionali — 0.7.0

Le nuove storie **Casuali** hanno sei ambienti con opportunità diverse. Zone umide e terre aride aggiungono geografie riconoscibili alla regione di mille metri; le otto culture continuano a usare risorse finite e lavoro reale.

| Ambiente    | Opportunità                              | Raccolto agricolo rispetto alla prateria | Tempo di viaggio a parità di distanza |
| ----------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Prateria    | Terreno aperto e risorse distribuite     | 100%                                     | 100%                                  |
| Foresta     | Molto legno e fauna                      | 85%                                      | 110%                                  |
| Montagna    | Pietra e minerali                        | 55%                                      | 130%                                  |
| Fiume       | Sponde fertili, attraversamenti ai guadi | 115%                                     | 110%                                  |
| Zona umida  | Molte bacche e suolo fertile             | 125%                                     | 120%                                  |
| Terra arida | Più pietra, poco legno e cibo spontaneo  | 65%                                      | 100%                                  |

I moltiplicatori agricoli valgono a parità di lavoro, stagione, manutenzione e altre condizioni. Si applicano al campo nella sua posizione effettiva, sia nei villaggi sia nelle città. Il terreno non crea risorse estratte aggiuntive e non sostituisce addetti o sementi. La siccità mantiene le proprie regole.

Il costo degli spostamenti si applica ai tratti effettivamente attraversati. I percorsi possono preferire un cammino più lungo ma meno faticoso; le scorciatoie del disegno del percorso conservano questo vantaggio. Persone, fauna, eserciti, delegati e convogli condividono la regola. Le strade continuano a registrare distanze e segmenti fisici. Il pianificatore resta una ricerca su griglia da quattro metri con semplificazione, non un solutore continuo esatto.

L’economia delle culture paga il costo del terreno nei trasporti fra distretti, mantenendo il limite fisico di centottanta metri per le fonti vicine. Il lavoro locale nello stesso distretto conserva la precedente astrazione. La previsione dei pasti considera la fertilità dei campi; una cultura con Agricoltura valuta anche il raccolto potenziale di una colonia prima di impegnare persone e carichi. La stima del freddo per il foraggiamento autonomo usa il tempo di viaggio aggiornato, senza cambiare la temperatura dei biomi.

## Leggere il territorio

Seleziona un punto esplorato, una risorsa o un edificio e apri **Terreno** nella scheda già presente sulla mappa. Gli effetti agricoli compaiono dopo Agricoltura; le percentuali dopo Numero. Il terreno inesplorato non viene rivelato dal pannello. Le informazioni rimangono richiudibili e scrollabili su schermi stretti.

Le zone umide hanno pigmenti verdi e piccoli giunchi; le terre aride hanno colori ocra, vegetazione rada e venature del terreno. Il disegno è preparato nella superficie del terreno già memorizzata. Le zone umide restano attraversabili: i piccoli accenti grafici non introducono acqua profonda o risorse raccoglibili.

## Compatibilità

Per usare i nuovi ambienti occorre una **nuova storia Casuale**. I salvataggi registrano `mapGeneration.biomeRules: 1` insieme a dimensioni regionali, guadi e otto culture. Il caricamento conserva il mondo effettivo e non aggiunge i nuovi biomi alle partite precedenti. Senza il metadato, velocità e raccolti seguono le regole precedenti. Seed Zero mantiene lo scenario originario.

Il seed va letto insieme alla versione delle regole: ricreare oggi una nuova regione con un vecchio seed può dare risorse e insediamenti diversi. Importare il vecchio salvataggio mantiene la disposizione giocata.

## Prove e seguito

Le prove dedicate verificano generazione riproducibile, risorse iniziali, percorsi asciutti, integrali del movimento ai confini dei settori, deviazioni meno faticose, raccolti sostenuti da lavoro reale, conservazione delle risorse, scelte delle colonie e compatibilità dei salvataggi. Le scene browser preparate verificano leggibilità e interazioni; non dimostrano una campagna completa.

La suite completa comprende **1.660 test unitari** e **240 casi browser**, con i casi aggiornati rieseguiti dopo la verifica completa. L’apertura Guidata regionale sui seed **1, 42 e 6842** ottiene fuoco e scorte entro 350 secondi con i sette fondatori vivi. Lo studio isolato delle società sui medesimi seed attraversa quaranta stagioni del calendario corrente: le otto culture rimangono vitali ai controlli annuali e fondano colonie con persone e scorte pagate. Lo studio controlla l’epoca del giocatore e ne rimuove i personaggi per isolare l’economia straniera; non dimostra una campagna completa del giocatore.

- [Dettagli del terreno su telefono](images/ui070-biome-details-390.png).
- [Sei ambienti nella panoramica regionale](images/ui070-region-biomes-390.png).

Le schermate usano scene preparate: il primo campo è collocato artificialmente in una zona umida per confrontare gli effetti; la panoramica rivela una regione generata e imposta un’epoca urbana. La partenza ordinaria resta in prateria.

Il traguardo successivo dell’[espansione del mondo](WORLD-EXPANSION.md) riguarda coste e mare, iniziando da pesca e conservazione prima di approdi e navigazione.
