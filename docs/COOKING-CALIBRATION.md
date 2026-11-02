# Cuocere prima di Sempre

La calibrazione A-58 risolve un vincolo di ergonomia verificabile. In una
stagione ordinaria quindici adulti consumano nominalmente
`15 × 90 × 0,8 = 1080` punti di nutrimento. Una porzione cotta ne offre sessanta:
servono quindi diciotto porzioni, prima di sprechi e tragitti. Una sola Voce ogni
dieci secondi permette nove ordini per stagione. Poiché Sempre richiede anche
trentacinque abitanti per il Tier 3, affidare ogni porzione a un nuovo ordine
rendeva una dieta cotta incompatibile con le altre attività del villaggio.

## Comportamento

In Guidata un ordine `Io/Gruppo · Cuocere · Preda · Fuoco` assegna un artigiano
reale. Il primo ordine costa una Voce. Il cuoco ripete il lavoro durante il
giorno, pagando una carne prima di ogni ciclo di cinque secondi biologici e
producendo una porzione cotta alla fine. Il costo del ciclo successivo viene
verificato e pagato soltanto quando quel ciclo comincia. Non si aggiungono
porzioni, calore, ingredienti o ricariche di Voce.

Il calendario condiviso conserva la resa: nel primo anno Guidato il lavoro
procede a `90 / 150`, quindi una porzione richiede circa 8,33 secondi reali; dal
secondo anno richiede cinque secondi. Una giornata completa permette nominalmente
dodici cicli in entrambi i calendari, prima degli spostamenti e dei bisogni.
Fame, freddo, mancanza di una parola, divieti o fine del giorno impediscono un
nuovo ciclo. Un ciclo già pagato può finire al tramonto; l’ordine non si trasforma
in una tradizione che riparte da sola il giorno dopo.

La capienza usa le stesse categorie reali delle scorte e considera il posto
liberato dall’ingrediente prelevato dall’inventario. Se la carne è soltanto a
terra e il deposito è pieno, il nuovo ciclo non la consuma. Se una vera consegna
occupa lo spazio durante un ciclo già pagato, l’uscita può rimanere a terra come
ogni altro manufatto: non viene cancellata.

Ceramica e lance rimangono lavori singoli. In Classica ogni ordine di cottura
rimane un ciclo singolo. Una correzione comune impedisce invece di finire una
cottura senza fuoco: la porzione o la pietra già prelevata ma non trasformata
rimane fisicamente ai piedi dell’artigiano, una sola volta. Nessun rimborso viene
creato per un ciclo che non aveva ancora pagato. Per riprendere si ravviva il
Falò e si impartisce un nuovo ordine.

## Verifica

`guidedCooking.test.ts` comprende ventitré casi, tra cui ventidue pasti da due
cuochi e due ordini reali, esaurimento, fuoco assente o spento, lavoro al
tramonto, bisogni, oblio, una nuova legge, capienza piena, ingredienti locali,
interruzione, salvataggio e ripresa, equivalenza fra aggiornamenti incrementali
e cumulativi, calendario iniziale, anteprima e compatibilità Classica.
I test di trasporto, manufatti, tradizioni ed esiti dei compiti restano separati.
Queste sono prove meccaniche; la crescita ordinaria dalle sette persone a una
città resta una verifica distinta.
