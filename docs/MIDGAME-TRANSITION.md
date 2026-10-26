# Verifica continua di un insediamento neolitico

Questa prova isola crescita, sussistenza, ricambio e Scrittura a partire da una
società **preparata di 35 persone**. Non dimostra il percorso dalle sette persone
iniziali, la crescita fino a 150 o una vittoria. Non va sommata ai replay urbani
preparati per dichiarare completata una campagna ordinaria.

## Posizione iniziale dichiarata

`preparedNeolithicSettlement` prepara una Guidata sul Seed Zero 6842, senza città,
Scrittura, istituzioni o governo monarchico. Per isolare questi sistemi rimuove
le società straniere; conserva i nodi e gli animali originali della mappa, ed
esplora i nove settori centrali.

Le 35 persone sono 18 uomini e 17 donne, hanno età da quattro a dieci stagioni,
forza cinque e intelligenza otto. La distribuzione favorisce gli adulti giovani:
24 persone hanno quattro–sei stagioni, le altre coprono quattro–dieci. È quindi
un insediamento favorevole preparato, non un campione casuale della prima
società arrivata al Neolitico.

Il vocabolario iniziale comprende 27 parole: quattro innate, Io, Qui, Portare,
Pietra, Legno, Preda, Conservare, Domani, Fuoco, Cuocere, Costruire, Morte,
Seminare, Addomesticare, Sempre, Mio, Numero, Confine, Metallo, Altrimenti,
Scheggiare, Pericolo e Chi è Forte. Tutti i fondatori le conoscono, con memoria
iniziale cento. Numero e Confine appartengono alla storia preparata; questa
prova non ricostruisce la loro acquisizione. Non prepara Scrittura, Macchina,
Legge, Dubitare o Città.

| Dotazione iniziale                       |           Quantità |
| ---------------------------------------- | -----------------: |
| Vegetali / carne / cibo cotto            |    400 / 140 / 100 |
| Legno / pietra                           |          700 / 600 |
| Semi / pelli / utensili / lingotti       | 100 / 50 / 20 / 20 |
| Monete                                   |               1000 |
| Case / pozzi scorte / depositi materiali |          8 / 5 / 4 |
| Palizzata / Falò / Tumulo                |          1 / 1 / 1 |
| Recinti / campi                          |              8 / 3 |

Le scorte sono finite e ricche: 740 unità alimentari (compresi i semi) entro la capienza di 1000 e
1390 materiali entro quella di 2000. Le monete non hanno un limite di deposito.
Ogni recinto contiene un capo. Sono preparati gli incarichi di una guardia del
Falò, un addetto al Tumulo, sedici allevatori e nove agricoltori; nessun lavoro
stagionale già maturato viene inventato.

## Azioni successive e prova permanente

Dopo la preparazione il pilota usa soltanto ordini pubblici, Scintille realmente
prodotte, lezioni e consigli pagati e `tick`. Costruisce gli edifici aggiuntivi,
paga mantenimenti e mangime, assegna persone effettive, raccoglie dai nodi e
tramanda ai nati. Rifiuta di fondare automaticamente una monarchia con il primo
anziano che comprende Re. Non modifica più posizioni, età, inventari, RNG,
conoscenze o popolazione direttamente.

I due casi permanenti in `neolithicTransition.test.ts` verificano la validità e
la capienza della posizione preparata, poi otto stagioni continue. Nel percorso
corrente a 720 secondi ci sono **80 persone, 46 nascite e una morte naturale**. La
Scrittura nasce a cinque secondi dall'esperienza di sovraccarico orale, con la
ricetta `Numero + Pietra + Domani`; il pilota paga e costruisce un Archivio e ne
fa lavorare realmente gli scribi. Sono verificati anche insegnamento pagato,
parentele effettive e assenza di urbanizzazione prematura. Le asserzioni usano
soglie conservative, senza fissare l'intera sequenza casuale delle nascite.

## Proseguimento osservato e limite aperto

Un'esecuzione separata dello stesso pilota fino a 2700 secondi raggiunge il picco
di **113 persone a 1890 secondi**. Termina a 2232,5 secondi per coesione esaurita,
con 106 persone vive, 144 nascite e 73 morti registrate: 66 di vecchiaia e sette
dopo pasti di carne cruda. Il salvataggio finale è valido e il conteggio delle
morti coincide con quello dei corpi: nessun individuo resta fuori dalla contabilità.

Il pilota mantiene cibo e legna, ma trascura la pietra per il mantenimento delle
case: gli alloggi si disattivano e le nascite si fermano temporaneamente. Inoltre
non organizza una dieta cotta sufficiente; le intossicazioni, pur con sepolture
reali, consumano la coesione. Deve migliorare queste strategie prima di poter
provare crescita a 150 e condensazione urbana. Questo fallimento non dimostra
un'impossibilità della formula demografica.

Il percorso impiega ceramica realmente fabbricata, prevede il marciume per la
riserva di mangime, ripristina gli addetti alle strutture prima delle raccolte
facoltative e tramanda le parole ai nuovi nati con Attenzione e legna pagate.
Non altera le probabilità o gli inventari per superare le difficoltà.

Questo studio ha individuato un difetto separatamente corretto e verificato:
il sostegno dell'Archivio preurbano legge ora il lavoro della stagione conclusa,
anche quando gli scribi dormono al consiglio. La prova di crescita a 150, la
condensazione urbana ordinaria e la calibrazione dei tempi delle tre vittorie
rimangono aperte. Le condizioni finali da società urbane preparate sono descritte
separatamente in [VICTORY-ROUTES.md](VICTORY-ROUTES.md).
