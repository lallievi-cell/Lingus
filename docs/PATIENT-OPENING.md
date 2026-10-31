# Un primo anno con spazio per imparare

Questa calibrazione deriva dalla richiesta del giocatore di migliorare ritmo, Falò e protezione delle prime conoscenze. È una scelta di prodotto per le **nuove partite Guidate**, non una reinterpretazione del documento originale. Il campo persistente `openingBalanceVersion: 1` identifica il nuovo comportamento.

## Calendario e costi

| Passaggio              | Nuova Guidata | Classica e Guidata precedente |
| ---------------------- | ------------- | ----------------------------- |
| Prima notte            | 100 s         | 60 s                          |
| Estate                 | 150 s         | 90 s                          |
| Autunno                | 300 s         | 180 s                         |
| Inverno                | 450 s         | 270 s                         |
| Secondo anno           | 600 s         | 360 s                         |
| Notte del secondo anno | 660 s         | 420 s                         |

Il primo anno contiene quattro stagioni da 150 secondi: 100 di luce e 50 di notte. Dal secondo anno ogni stagione dura 90 secondi: 60 di luce e 30 di notte. I valori sono tempo di simulazione a velocità normale; pausa e accelerazione restano controlli del giocatore.

`calendar.ts` centralizza confini, anno, stagione, luce e notte. Il nuovo tick liquida un cambio esattamente al confine e si ferma se deve aprire il consiglio. Il tempo delle animazioni resta separato.

Fame, temperatura, danni da fame/freddo, guarigione ordinaria e cicli produttivi impiegano secondi equivalenti: ogni secondo del primo anno vale `90 / 150 = 0,6` secondi biologici o produttivi. Movimento, combattimenti e pasti mantengono la propria reattività fisica; ferite, epidemie e assedi conservano i loro timer fisici. I lavori stagionali accumulano i secondi reali e raggiungono il rendimento pieno con un turno diurno completo: 100 secondi nel primo anno, poi 60. Rese agricole e budget urbani rimangono un pagamento per stagione, senza un secondo moltiplicatore.

La previsione alimentare integra la domanda attraverso il cambio di ritmo a 600 secondi e converte l’autonomia in secondi disponibili. Mercanti, tregue e pressioni straniere seguono le proprie cadenze culturali; il tempo di marcia resta fisico. La prima tormenta Guidata rimane esclusa, con rischio reale negli anni successivi.

## Scorte e materiali accessibili

Il deterioramento alimentare delle nuove Guidate viene moltiplicato per 0,4 nelle prime quattro stagioni concluse, 0,7 nelle quattro successive e 1 dalla nona. La perdita base dei vegetali passa quindi dal 50% al 20% nel primo anno e al 35% nel secondo; estate, Pozzo scorte e ceramica conservano i propri moltiplicatori. Legno e altri materiali non ricevono questo beneficio. Villaggio, province, contabilità straniera e previsione alimentare usano lo stesso coefficiente, applicato alla stagione assoluta che si chiude.

Un artigiano entro 15 metri dal giaciglio può usare i materiali effettivamente estratti entro 35 metri dal campo. Fuori dal campo rimane la portata locale di 15 metri. La spesa preleva davvero le scorte o riduce i cumuli: nessun materiale viene creato. Questo evita di dipendere dall’intersezione geometrica fra i primi due nodi di una mappa casuale.

La ricerca autonoma del cibo stima anche il raffreddamento del viaggio di andata e ritorno. In presenza di un riparo reale, un appetito ordinario non porta una persona in un tragitto che la farebbe tornare sotto la soglia di allarme. Gli ordini espliciti e la fame urgente mantengono il comportamento ordinario; il percorso può comunque essere rischioso e il cibo va preparato dal giocatore.

## Un Falò con scelte leggibili

Ogni lezione continua a costare **10 Attenzione** e forma **un custode reale per una parola**. Il nuovo budget stagionale è:

`base + 2 × legno bruciato + 5 × anziani equivalenti + contributo dei templi − 2 × max(0, fame media − 70)`

La base è 30 nei primi quattro consigli, poi 20. Rimangono tetto e modificatori dei dogmi. In condizioni ordinarie sono disponibili alcune lezioni prima degli investimenti facoltativi; una vera crisi alimentare può ridurle o azzerarle. Il combustibile già consumato da un racconto pagato non viene contato di nuovo al cambio di stagione.

Il pannello mostra le lezioni ancora sostenibili, con descrizione qualitativa prima di Numero. Le parole note spiegano quale capacità viene conservata. Il giocatore sceglie quali possibilità affidare alla generazione successiva; i pulsanti eseguono lezioni singole e pagate.

## Il primo passaggio di sapere

Tramandare una parola di Tier 1 o 2 custodita da una sola persona porta la memoria almeno a 80 durante il primo anno. Il sostegno vale anche se un custode aggiuntivo è morto e occorre affidare di nuovo la parola a un’altra voce. Anteprima e azione condividono il guadagno. Non vengono aggiunti custodi senza lezione e una parola perduta deve essere riscoperta.

Il coefficiente normale di oblio del dogma viene moltiplicato per un terzo nelle prime quattro stagioni concluse, per due terzi nelle quattro successive e poi torna intero. Con il coefficiente ordinario 3 significa gamma 1, 2 e 3. Stele, archivi, uso e modificatori conservano i propri effetti.

Il calore è un uso concreto di Fuoco: quando almeno un custode libero e vivo beneficia di un Falò acceso in un ambiente freddo, ogni due secondi equivalenti viene registrato un uso globale. Più persone non moltiplicano il bonus. Fuochi vuoti o lontani, clima già caldo e parole perdute non producono rinforzo. La comunità può così ricordare una capacità che sta realmente impiegando.

## Scoperte e persone

Legno, Pietra e Pericolo vengono compresi quando matura una vera esperienza valida. Conservano primo custode, ricetta appresa, memoria e conseguenze normali. Un avviso breve mostra ciò che cambia senza fermare la partita; il lessico mantiene la spiegazione. Le altre Scintille, compresi i puzzle che combinano concetti, restano da comprendere.

Consegnare cibo dopo aver conosciuto la Notte può far nascere Domani. La previdenza può emergere da un’azione riuscita, senza richiedere che la tribù venga prima affamata. L’esperienza nasce soltanto da una consegna effettiva e usa il normale puzzle e le normali condizioni cognitive.

Le nuove Guidate spostano di due stagioni la curva senile, mantenendo età adulta, fertilità e condizione anziana precedenti. I sette fondatori non muoiono di vecchiaia prima di due consigli realmente conclusi; questa protezione termina comunque alla stagione assoluta 8. Fame, freddo, ferite e altri pericoli restano reali. Riaprire il Falò o preparare una lezione breve non incrementa il contatore.

## Compatibilità e verifica

I salvataggi esistenti, privi del profilo, mantengono calendario e regole precedenti. Non vengono rigenerati mondi o inventate risorse. La validazione rifiuta versioni sconosciute, profili incoerenti e contatori impossibili; i registri del lavoro vengono verificati rispetto alla durata della propria stagione.

Le suite storiche dichiarano il profilo precedente quando verificano tempi o budget precedenti. Le nuove prove coprono calendario e confini, domanda alimentare, economie, clima, mortalità, memoria, consegne, custodia, scoperte contestuali e UI. Il nuovo replay ordinario è separato dagli stati preparati e dalla campagna storica: usa comandi, esperienze, risorse e lezioni reali.

La verifica completa supera 1.197 prove del motore e dei componenti e 135 casi nel browser. Due ulteriori ripetizioni del primo consiglio verificano la prima azione visibile senza scorrimento su telefono e desktop, tre lezioni effettivamente pagate, memoria e contatore dei consigli persistenti.

Otto replay ordinari impiegano soltanto decisioni a multipli di dieci secondi: sei varianti sulla valle originaria e due geografie generate, comprese preparazioni ritardate. Nei casi esercitati il primo Fuoco arriva almeno una stagione prima dell’inverno, non si verificano morti, le capacità fondamentali vengono affidate ad altri custodi e si svolgono almeno due consigli utili nel primo anno. Il maltempo può rinviare un consiglio e richiedere una riaccensione pagata: non viene soppresso per far riuscire il percorso. Le varianti di approvvigionamento controllano anche fame dopo l’inverno e assenza di carichi perduti durante i cambi di fonte.

![Primo consiglio su telefono, ottenuto da una rotta ordinaria](images/patient-council-390.png)

I controlli dimostrano comportamento e raggiungibilità delle rotte esercitate. Il piacere di giocare e il tempo necessario a un principiante per orientarsi richiedono ancora osservazione con persone nuove; una rotta riuscita non certifica il divertimento.
