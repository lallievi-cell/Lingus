# Scala del mondo e navigazione

La mappa della 0.8.0 è una regione di **1.000 × 1.000 metri**, con un mare lungo uno dei quattro lati. Il seed sceglie orientamento e linea di costa. Questa geografia non genera continenti o mari interni.

La 0.9.0 conserva questa scala locale e introduce primi isolotti nella fascia marina, raggiungibili con barche reali. Gli isolotti sono luoghi di spedizione e raccolta; non rappresentano un continente o un mondo già esteso a più regioni.

## Perché un mondo richiede più regioni

Un chilometro quadrato offre spazio al campo, al lavoro, alle culture vicine e a piccoli collegamenti costieri. Continenti, arcipelaghi articolati e mari interni richiedono un territorio strategico più ampio.

Allargare semplicemente il quadrato della simulazione a quattro chilometri per lato moltiplicherebbe l’area per sedici: la griglia di navigazione da quattro metri passerebbe da 63.001 a 1.002.001 nodi, e mantenere la densità attuale porterebbe a decine di migliaia di oggetti. La superficie del terreno, limitata a 3.600 × 2.400 pixel, avrebbe inoltre meno dettaglio locale. Copiare e salvare tutto questo a ogni aggiornamento sarebbe una scelta onerosa sui telefoni.

La direzione scelta è quindi avere **due scale collegate**:

- **Regione locale:** distanze di lavoro, persone, risorse finite, edifici, guadi e approdi alla scala attuale.
- **Mondo strategico:** più regioni terrestri e marine, con continuità di coste e fiumi, isole e bacini interni. Il dettaglio locale viene generato e mantenuto quando serve.

Una griglia iniziale di otto per otto regioni sarebbe un possibile prototipo di 64 km², non una dimensione definitiva del mondo né una funzione già disponibile nella 0.9.0. Il numero di regioni e le distanze strategiche andranno scelti insieme ai tempi di navigazione e ai rifornimenti, dopo prove effettive.

## Condizioni per l’espansione successiva

Il passaggio di scala deve mantenere la stessa identità di persone, barche, carichi e risorse quando si attraversa un confine regionale. Le culture lontane devono consumare e produrre attraverso bilanci materiali verificabili; una regione inattiva non può ricevere scorte gratuite o rigenerare i nodi esauriti.

La persistenza dovrà conservare seed e versione della geografia, aggiungendo gli scostamenti reali dalla generazione iniziale. Il limite attuale di importazione e il sistema di salvataggio vanno valutati prima di accumulare decine di regioni complete. Anche cache del terreno, nebbia, selezione e ricerca dei percorsi dovranno lavorare per zone, mantenendo limiti di memoria espliciti.

L’atlante sarà una rappresentazione di geografia e collegamenti realmente utilizzabili. La 0.9.0 non presenta una mappa mondiale illustrata come se il transito tra regioni fosse già implementato.
