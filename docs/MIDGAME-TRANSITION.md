# Verifica continua di un insediamento neolitico

Questa prova isola crescita, sussistenza, ricambio e Scrittura a partire da una
società **preparata di 35 persone**. Non dimostra il percorso dalle sette persone
iniziali o una vittoria. La revisione successiva dimostra invece la crescita a 150
e la condensazione urbana da questa posizione preparata. Non va sommata ai replay urbani
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
corrente a 720 secondi ci sono **89 persone, 56 nascite e due morti naturali**. La
Scrittura nasce a cinque secondi dall'esperienza di sovraccarico orale, con la
ricetta `Numero + Pietra + Domani`; il pilota paga e costruisce un Archivio e ne
fa lavorare realmente gli scribi. Sono verificati anche insegnamento pagato,
parentele effettive e assenza di urbanizzazione prematura. Le asserzioni usano
soglie conservative, senza fissare l'intera sequenza casuale delle nascite.

## Diciotto stagioni, ricambio e condensazione urbana

La revisione continua dello stesso pilota arriva a **161 abitanti a 1620 secondi**,
con 169 nascite, 43 morti, Coesione 85 e alloggi effettivi per 274 persone. Il
sovraccarico orale ha generato Scrittura a cinque secondi; la comprensione di
Città avviene a 1625 secondi attraverso `Gruppo + Confine + Scrittura`. Il motore
condensa effettivamente la comunità nel Tier 4 a 1625,25 secondi. Il replay si
ferma al primo aggiornamento successivo, a 1630 secondi.

Il percorso usa **116 ordini accettati e 171 lezioni pagate**. Al passaggio urbano
Scrittura conserva memoria 83,58. Le scorte rimanenti sono finite, con circa
78,77 legno e 137 pietra; il cibo effettivo fornisce circa 27213 punti di
nutrimento. Non vengono aggiunti nuovi materiali, persone, parole o riserve al
di fuori dei normali risultati delle azioni successive alla preparazione.

Il pilota ora riserva pietra alla manutenzione, fabbrica ceramica, prevede il
marciume del mangime e organizza la cottura. Durante il ricambio generazionale
riassegna quattro persone realmente qualificate all’Archivio, anche cambiando
un precedente lavoro agricolo con un ordine pubblico. Aspettare soltanto saggi
senza un incarico lasciava i posti vuoti: la Scrittura decadeva prima di arrivare a Città.
L’efficienza dell’Archivio rimane superiore al novanta per cento nelle stagioni
completate del ricambio finale.

La prova ha anche individuato un difetto di esecuzione: il compilatore accettava
le tradizioni di Cuocere e Scheggiare, ma il motore non assegnava il lavoro
artigiano. Queste tradizioni ora avviano cicli reali, pagando ogni input prima
che cominci il lavoro. Senza falò attivo, ingredienti o capienza sufficiente non
pagano e non producono; di notte Sempre non avvia nuovi cicli. I cinque casi di
`artisanTraditions.test.ts` verificano pasti ripetuti, mancanza del fuoco,
riposo, deposito pieno e costo di ogni lancia. Non aumentano rese o probabilità
demografiche.

Il terzo caso permanente di `neolithicTransition.test.ts` verifica diciotto
stagioni, custodia della Scrittura, nascita reale di Città, coorti per almeno
150 persone e salvataggio valido. Il punto iniziale rimane ricco e preparato:
**questa prova non chiude il percorso dalle sette persone a trentacinque**, né
la sostenibilità urbana successiva o una delle tre vittorie. Le condizioni
finali da società urbane preparate restano descritte separatamente in
[VICTORY-ROUTES.md](VICTORY-ROUTES.md).
