# Il ciclo delle ombre — 0.3.9

Le ombre solari seguono il giorno della partita: al mattino si proiettano verso ovest, si accorciano a mezzogiorno e si allungano verso est nel pomeriggio. Sfumano all’alba e al tramonto e scompaiono per tutta la notte. La ripartenza est–ovest del nuovo giorno avviene quando sono invisibili.

Il ciclo usa il calendario effettivo: nelle nuove Guidate rispetta le stagioni iniziali da 150 secondi, poi quelle da 90 secondi. In Classica usa sempre quelle da 90 secondi. La pausa e la sospensione della simulazione durante la consultazione mobile fermano anche le ombre.

Restano le ombre di contatto delle figure e l’illuminazione locale del falò. Tempeste e tormente attenuano le ombre solari. Conoscenza dei materiali ed esplorazione continuano a governare quali sorgenti possono essere mostrate.

La direzione e la lunghezza vengono calcolate una sola volta per disegno della mappa; ogni oggetto riutilizza la stessa piccola maschera già presente nella versione precedente. Il margine di disegno lascia spazio anche alle ombre delle sorgenti appena fuori dalla visuale. La modifica non cambia la simulazione né il formato dei salvataggi.

Le prove verificano direzione, lunghezza, sfumatura ai confini del giorno, notte completa, equivalenza dei calendari e immutabilità dello stato. Una prova browser misura i pixel effettivamente disegnati dalla passata solare; le scene del renderer completo verificano selezione e stabilità in pausa, quattro stagioni e notte su telefono e desktop.

Verifica mirata: 53 test unitari e 17 prove browser superati. Il [confronto delle quattro fasi](images/ui039-shadow-cycle.png) isola il disegno dell’ombra solare; il punto indica l’ancoraggio dell’albero al terreno.
