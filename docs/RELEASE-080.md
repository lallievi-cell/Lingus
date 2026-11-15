# Coste e pesca — 0.8.0

Le nuove storie Casuali di mille metri hanno una costa fisica e una fascia di mare esterna, larga circa cento metri. Il mare non si attraversa a piedi: i guadi restano passaggi del fiume e non aprono una strada in mare. Anche un percorso con estremi asciutti deve aggirare le baie.

La riva è una linea spezzata ricavata dal seed originale e condivisa da disegno, navigazione e terreno. Il fiume sfocia nel mare senza perdere la catena dei settori da cui deriva il suo corso. La costa ha fertilità del 75% e costo di viaggio del 110% rispetto alla prateria; il mare non sostiene campi o costruzioni.

## Il lavoro sulla riva

I punti di pesca sono postazioni sulla terraferma, circa dieci metri all’interno della riva, con riserve finite iniziali di quaranta–sessanta unità. Con **Portare + Preda**, una persona raggiunge il punto, lavora sei secondi per carico e trasporta il pescato al campo. La capacità ordinaria rimane una, tre o cinque unità secondo le conoscenze. La riserva diminuisce alla cattura; le scorte aumentano alla consegna.

Il banco non si mangia sul posto, non si colpisce e non si alleva. Il pesce già catturato può invece essere consumato, trasportato e conservato. Non produce pelli o semi. Nel Frasario, **Pesca e porta al campo** prepara la frase con una postazione osservata e raggiungibile: occorre ancora pronunciarla, pagando la Voce ordinaria.

| Risorsa     | Nutrimento | Deterioramento stagionale di base |
| ----------- | ---------- | --------------------------------- |
| Pesce crudo | 40         | 60%                               |
| Pesce cotto | 60         | 25%                               |

Le quattordici risorse precedenti restano distinte: con i due tipi di pesce diventano sedici. Il catalogo conserva quarantacinque parole. Il pesce crudo segue le regole del cibo animale crudo; il Vegetarianismo vieta entrambi i tipi. La preparazione stagionale distingue il pesce crudo dal cibo già sicuro.

**Cuocere + Preda** usa normalmente carne disponibile, oppure pesce quando manca la carne. Un mucchio di pesce catturato selezionato esplicitamente ha precedenza quando un lavoratore può accedervi. Il tipo di input pagato rimane registrato fino alla conclusione o alla restituzione fisica, anche durante interruzioni e ricaricamenti. Le culture autonome pagano riserva, lavoro, trasporto, input di cottura e combustibile.

## Immagini e compatibilità

Sabbia, fondali e mare seguono la geografia reale. Le piccole animazioni seguono il tempo di gioco e rispettano pausa, movimento ridotto, esplorazione e campo visibile. Postazioni, carichi e mucchi distinguono pesca, pesce crudo e pesce cotto. La posa di pesca appare soltanto quando il lavoratore è arrivato e sta lavorando.

La regola richiede `mapGeneration.coastalRules: 1`, insieme a regione, culture, biomi e guadi. Nessuna costa o attività marina viene aggiunta ai mondi precedenti o a Seed Zero. Il caricamento dei vecchi inventari aggiunge zero soltanto alle due chiavi nuove assenti; valori presenti ma invalidi vengono rifiutati. Le impronte geografiche storiche ignorano soltanto le due nuove chiavi a zero, senza cambiare gli hash attesi.

Approdi, imbarcazioni, isole e collegamenti marittimi restano traguardi successivi. Le prove browser su scene preparate verificano interfaccia e ordini, senza rappresentare una campagna completa dall’inizio.

- [Pesca sulla riva, telefono](images/ui080-coastal-fishing-390.png).
- [Pesca sulla riva, desktop](images/ui080-coastal-fishing-1440.png).
- [Scorte distinte sul telefono](images/ui080-coastal-stocks-390.png).

Le immagini provengono da una scena preparata: una postazione e la riva sono generate dal seed `123`; il campo viene collocato nell’entroterra vicino, con un adulto e le conoscenze necessarie. La prova impartisce ordini dall’interfaccia e lascia alla simulazione lavoro e consegna; non rappresenta una campagna iniziata con i sette fondatori.
