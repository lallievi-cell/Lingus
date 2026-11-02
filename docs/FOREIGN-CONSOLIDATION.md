# Consolidamento delle società straniere

Questa revisione completa la politica descritta in [FOREIGN-POLICY.md](FOREIGN-POLICY.md). Le scelte del pianificatore sono estensioni di prodotto; non cambiano il catalogo delle risorse, i costi edilizi o la formula delle nascite e non vengono attribuite al documento originale.

## Un'economia che prepara la stagione successiva

Il pianificatore separa cibo immediato, sementi, combustibile e surplus commerciabile. Conserva i semi necessari ai campi già presenti fino al prossimo pagamento primaverile, includendo il marciume intermedio. Un nuovo campo richiede anche la riserva per mantenere quelli esistenti. Se servono semi, i lavoratori possono raccogliere bacche anche quando la comunità ha già mangiato: ogni raccolta sottrae materiale a un nodo reale, impiega lavoro e tira la stessa probabilità del dieci per cento del giocatore. Non vengono aggiunti semi per coprire automaticamente un deficit.

La cottura conserva il legno della prossima manutenzione del falò. Le fonderie rispettano inoltre una riserva per i pasti da cuocere e smettono di produrre lingotti quando ne conservano dodici in pace o venti durante un conflitto. Queste soglie limitano la produzione discrezionale; non producono metallo o combustibile. Gli addetti di una fonderia senza input o con scorta sufficiente tornano disponibili per le altre attività. La domanda militare è valutata separatamente: durante un conflitto una fonderia con lingotti disponibili può conservare gli addetti e forgiare armi anche senza minerale o legna per fondere altro metallo. Assegnazione e lavorazione continua condividono lo stesso criterio, evitando un blocco della produzione bellica. Il giocatore mantiene il controllo delle proprie fonderie: queste decisioni automatiche riguardano le città straniere.

I mercanti esportano soltanto il nutrimento che supera il fabbisogno di una stagione e il legno che supera la riserva del focolare. Partenza, scambio e ritorno continuano a spostare merci e monete effettive. Se la città d'origine viene conquistata o resta senza abitanti, il carico cerca una città superstite della stessa fazione; non viene accreditato a distanza. Senza un rifugio resta materialmente con la carovana.

## Dottrine nate dalle pratiche

I popoli non ricevono una religione iniziale. Una società può costruire una Pietra Sacra soltanto conoscendo la ricetta del catalogo, pagando venti pietre e il lavoro edilizio nello stesso bilancio usato per cibo e raccolta. Per sviluppare una dottrina servono Sacro, almeno un saggio e il monumento integro, completato e attivo.

Le tre interpretazioni disponibili collegano pratiche già avvenute: il pasto notturno e il fuoco mantenuto nel tempo; il fuoco alimentato e usato per cuocere; il legno lavorato per costruire e mantenere il focolare. Il mantenimento deve essere stato realmente pagato in almeno due chiusure stagionali. Oggetto e vettore devono essere parole già conosciute e una combinazione dogmatica valida, senza conflitti con le regole presenti. La preferenza fra interpretazioni dipende dal seed della geografia e dall'identità della fazione, senza un nuovo tiro casuale.

Ogni fazione sviluppa al massimo due dottrine locali, separate da almeno quattro stagioni equivalenti. Rimane spazio per un successivo contatto culturale; la Pietra conserva il limite di tre dogmi. Il peso cresce una volta per stagione della fazione, anche se possiede più città. Nessuna di queste decisioni adotta parole o dogmi per il giocatore. Una richiesta religiosa richiede comunque un'opposizione effettiva alla sua dottrina; il dono diplomatico non obbliga a convertirsi.

## Evidenze e limiti

La verifica mirata comprende `foreignEconomy.test.ts`, `foreignCommerce.test.ts`, `foreignCulture.test.ts` e le regressioni di `foreignPolicy.test.ts` e `imperial.test.ts`.

- Le prove locali isolano raccolta, rifornimento dei semi, lavoro condiviso, riserva di combustibile, fonderie inattive, surplus commerciale e conservazione del carico. Le loro città sono preparate e dichiarate nelle fixture.
- Lo studio economico di quaranta stagioni parte dalle quattro società straniere iniziali senza aggiungere loro persone, scorte, parole o costruzioni. Rimuove gli attori del giocatore, usa il calendario ordinario e controlla la sua epoca per esercitare la politica. Dopo 3600 secondi ciascuna società conserva almeno otto abitanti e quattro lavoratori sui mondi Seed Zero e casuali 6842, 1 e 42; le risorse restano non negative e il salvataggio è valido. È uno studio isolato, non una partita ordinaria del giocatore.
- Una prova separata segue i Custodi dell'Alba per dieci stagioni: apprendono Sempre dalle manutenzioni effettive, pagano il monumento e formano una dottrina. Solo successivamente viene preparata una dottrina opposta del giocatore per verificare che la politica generi una richiesta religiosa. Non è una prova di scoperta autonoma della dottrina del giocatore.

Queste evidenze non certificano la crescita illimitata, ogni seed, ogni combinazione religiosa o una campagna completa fino alle vittorie. Le razzie restano soggette al Neolitico e al periodo di grazia; espansioni e guerre regionali richiedono ancora costi, persone e conoscenze previsti dalla politica esistente.
