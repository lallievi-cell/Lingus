# Audit della campagna continua

## Prova riproducibile sulla sorgente finale

`src/game/continuousCampaign.test.ts` esegue una partita Guidata dal seed
originale `6842`, con sette fondatori e quattro parole innate. Raggiunge
**2700 secondi, cioè trenta stagioni**, con nascite, discendenti diventati
genitori, materiali trasportati, costruzioni e lezioni effettivamente pagati.

Esecuzione:

```sh
npx vitest run src/game/continuousCampaign.test.ts
```

Il replay è diviso fra `tests/scenarios/campaignOpening.ts`, che prepara i primi
270 secondi, e `tests/scenarios/continuousCampaign.ts`, che prosegue assegnando
incarichi individuali. Non assegna risorse, posizioni, esperienza, parole, età,
popolazione o risultati casuali allo stato. Le azioni passano attraverso le API
pubbliche `issueCommand`, `solveSpark`, `teachWord`, `rehearseWord`,
`prepareCampfireCouncil`, `inscribeDogma`, `dismissCampfire` e `tick`.

I comandi vengono valutati ogni cinque secondi; il motore avanza internamente
con passi non superiori a 0,25 secondi. Le Scintille realmente prodotte vengono
risolte usando la loro ricetta. La ricognizione iniziale usa una vera selezione
circolare, arrotondata a metri interi, e un viaggio a est. Il pilota non sposta
unità direttamente. L'assegnazione iniziale del flag `started` corrisponde
all'avvio della partita nell'interfaccia.

## Risultati osservati

Il test usa soglie funzionali per evitare di vincolare ogni successiva correzione
alle identiche nascite casuali. Questi sono i conteggi dell'ultima esecuzione
completa sulla sorgente verificata:

| Tempo  | Vivi | Nascite cumulative | Morti di vecchiaia | Altre morti | Alloggi | Coesione |
| ------ | ---: | -----------------: | -----------------: | ----------: | ------: | -------: |
| 270 s  |    7 |                  0 |                  0 |           0 |      22 |      100 |
| 720 s  |    9 |                  5 |                  3 |           0 |      22 |       85 |
| 1440 s |   11 |                 11 |                  7 |           0 |      27 |       80 |
| 2160 s |   14 |                 18 |                 11 |           0 |      39 |       79 |
| 2700 s |   15 |                 23 |                 15 |           0 |      39 |       69 |

Il Falò è stato acceso a **145 s**; la prima Casa era completata prima del primo
inverno a 270 s. Al termine sono presenti Deposito, Pozzo scorte, Tumulo,
Recinto, Capanna, Pietra Sacra e due Case. Restano circa **706,7 punti di
nutrizione** nelle scorte accessibili; sono state pagate **74 lezioni**.
Diciotto persone nate durante la partita hanno almeno un genitore nato durante
lo stesso replay. Il test verifica esplicitamente l'esistenza di un nipote,
oltre al numero di nascite.

Il massimo osservato è quindici abitanti. A 2700 s la partita è ancora al Tier 2,
con venti parole vive e dieci stabili. Il waypoint termina per l'orizzonte
richiesto dal test, senza sconfitta e senza vittoria.

## Vincoli scoperti e gestiti dal pilota

- Il Deposito va costruito prima di accumulare i materiali della Casa: i trenta
  posti iniziali sono condivisi fra legna, pietra e utensili.
- Il Pozzo scorte può essere pagato anche con dieci pietre. Senza questa capacità,
  la produzione dei recinti può superare il limite alimentare e non garantire
  scorte per tutta la stagione.
- Il bestiame richiede cinque vegetali per recinto alla fine dell'inverno.
  La carne non paga il foraggio. Il recupero Guidato di un recinto inattivo usa
  un ordine sulla struttura e paga cinque vegetali reali; non accredita la
  produzione persa.
- Gli ordini collettivi possono interrompere trasportatori o addetti. Dopo
  l'apertura il replay usa incarichi individuali, preserva i carichi e assegna
  allevatori in funzione della popolazione e delle scorte effettive.
- La manutenzione della Casa richiede una riserva di pietra. La raccolta
  facoltativa di legna non deve impedirne l'arrivo.
- Le sepolture richiedono sia il Tumulo sia lavoro reale. Il pilota prepara la
  pietra prima dei lutti e mantiene un addetto funerario con almeno sette vivi;
  libera quell'incarico nelle comunità più piccole quando non ci sono cadaveri.
- Le parole con un solo custode anziano devono essere trasmesse anche con
  ritenzione alta: l'uso frequente non evita la perdita dell'ultimo custode.
- Una ricetta temporaneamente dimenticata non deve bloccare gli altri piani:
  il pilota passa al compito successivo se l'ordine non viene accettato.
- Scoprire Re instaura una monarchia. Il pilota rinvia questa Scintilla prima di
  trentacinque abitanti, evitando di incoronare subito un fondatore anziano e
  subire una crisi di successione non necessaria alla sua economia.

## Limiti dell'evidenza

Questo test dimostra un percorso concreto **7 → 15** e il ricambio generazionale
per trenta stagioni. **Non dimostra ancora una partita continua 7 → 35 → 150,
il Collasso Cognitivo Orale urbano o una delle tre vittorie dal primo minuto.**
Non è una prova di sopravvivenza indefinita oltre 2700 s, né di robustezza di questa
specifica strategia su tutte le mappe casuali. Il pilota conosce le regole, risolve
correttamente gli enigmi e prende decisioni ogni cinque secondi: non sostituisce
una prova di accessibilità con giocatori inesperti.

Gli scenari preparati della transizione urbana e delle vittorie restano prove
separate, con i rispettivi stati iniziali dichiarati. Le proiezioni demografiche
e un replay che parte già da trentacinque abitanti non vanno presentati come
prova dell'intera campagna da sette a centocinquanta.
