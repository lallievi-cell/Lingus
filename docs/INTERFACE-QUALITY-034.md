# Interfaccia 0.3.4

La revisione parte dai problemi osservati sulle schermate del giocatore: titoli duplicati, pannelli con troppa introduzione prima dei comandi, etichette quantitative sgrammaticate, obiettivi troncati e schede difficili da scorrere. Cambia la presentazione dell'intero gioco, senza modificare calendari, probabilità, costi o formule della simulazione.

## Un linguaggio visivo comune

`InterfacePolish.css` definisce ritmo, tipografia, superfici e gerarchia dei controlli dopo gli stili precedenti. Le finestre hanno un titolo semantico unico, intestazione stabile, chiusura raggiungibile e scorrimento del contenuto. Le azioni del consiglio mantengono contrasto verificabile anche nella modalità ad alto contrasto. Materiali e accenti delle ere restano collegati al Tier.

La densità deriva da meno ripetizioni e da dettagli progressivi: non dalla riduzione dei bersagli touch. Le azioni principali mantengono almeno 44 pixel di altezza; il testo grande, il contrasto alto e la preferenza di movimento ridotto restano operativi.

## Flussi rivisti

- **Lessico:** lista compatta, ricerca, categorie, parole a rischio e perdute. Aprire una parola mostra il suo significato, la memoria e le persone che la custodiscono. Le parole innate non ripetono indicatori di memoria irrilevanti. Le idee sconosciute rimangono senza nome e non sono rivelate dalla ricerca. Tramandare o preparare una stele conserva i normali requisiti e costi.
- **Falò:** Attenzione e combustibile precedono la scelta. Le parole fragili hanno priorità; ogni riga mostra chi racconta, chi imparerà, il costo e l'eventuale impedimento. Con poche parole si evitano filtri superflui. Piano di lezioni e spiegazioni rimangono disponibili dopo le azioni principali. Nascite e lutti hanno un riepilogo visibile con le proprie azioni; gli altri eventi sono espandibili. Inquadrare una nascita conserva il consiglio pagato e permette di tornarvi.
- **Frasario e costruzioni:** righe compatte con beneficio e azione, materiali e ricetta espandibili, preferiti e cronologia conservati. Cambiare ricerca o categoria riporta lo scorrimento all'inizio, evitando la prima scheda tagliata sotto i filtri. Preparare una frase non la pronuncia e non paga un edificio.
- **Tribù:** condizioni fisiche leggibili, incarico corrente e ultimo esito, crescita e caratteristiche nei dettagli. Gli avvisi sugli ultimi custodi conservano spiegazione e accesso al Falò. La selezione multipla continua a scegliere persone reali senza interromperle finché non viene impartito un ordine.
- **Mappa:** obiettivo intero, azione contestuale, minore sovrapposizione fra guida, intuizioni e aggiornamenti. Le scorte hanno nome e quantità su due righe nei telefoni, così il testo grande non spinge la prima risorsa fuori dallo schermo. Gli avvisi diplomatici mantengono i propri comandi visibili e lo scorrimento da tastiera. I dettagli dell'ordine restano raggiungibili anche sul bordo destro dei telefoni stretti.
- **Nuova partita:** scelte verticali brevi, confronto delle regole facoltativo, geografia e codice della valle separati. La storia esistente viene ancora archiviata secondo le stesse regole di recupero.
- **Primo avvio:** il comando Inizia è nell'intestazione stabile del benvenuto: resta raggiungibile durante la lettura delle scelte, senza sovrapporsi alle opzioni. La validazione del seed e la gestione dei conflitti di salvataggio rimangono le stesse.
- **Scintille e scorte:** istruzioni del puzzle più leggibili, tessere su due colonne nei telefoni stretti o con testo grande, nomi interi e categorie a capo. Il deposito evita il secondo grande titolo prima delle risorse; carichi in arrivo e materiali già consegnati restano distinti.
- **Impostazioni:** operazioni di salvataggio prima dei dettagli della storia e delle preferenze. Errori e avvisi sul salvataggio mantengono spiegazioni esplicite. Versione e controllo degli aggiornamenti sono compatti; commit e data sono nei dettagli.
- **Civiltà:** costruzioni ricercabili, istruzioni e leggi, città, popoli e vittorie presentano prima stato e azione, poi condizioni e spiegazioni. I requisiti delle vittorie continuano a descrivere il motore reale.

## Italiano e quantità

`semanticReadability.ts` distingue quantità, condizioni fisiche e capacità. Salute diventa «In buona salute» o «Salute critica»; fame «Molta fame» o «Fame estrema»; forza e intelligenza usano descrizioni sulla loro scala effettiva. Attenzione e materiali rispettano genere e numero. I numeri leggibili usano il formato italiano; prima di Numero rimangono qualitative le informazioni già soggette al filtro cognitivo.

La salute bassa non viene attribuita automaticamente a ferite: può derivare anche da fame, freddo o malattia. Gli incarichi di cottura chiedono carne e Falò, anziché la pietra dei manufatti.

## Audit e limiti delle prove

Il confronto visivo usa una copia isolata della 0.3.3 e gli stessi stati preparati della nuova interfaccia: 39 schermate per revisione, su 390 × 844, 320 × 640 con testo grande e contrasto alto, e desktop 1440 × 1050. Comprende mappa, tribù, pensiero, lessico, Falò, ricette, impostazioni, nuova partita, frasario, popoli, leggi, dogmi e vittorie. Sono scene di interfaccia dichiarate, non partite ordinarie.

Esempi conservati, acquisiti dal browser senza ritocchi:

| Flusso                                                                         | Schermata                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| Lessico prima della revisione, 0.3.3                                           | [390 px](images/ui034-before-lexicon-390.png) |
| Lessico compatto, 0.3.4                                                        | [390 px](images/ui034-lexicon-390.png)        |
| Primo insegnamento dopo una vera spesa di legno, testo grande e contrasto alto | [320 px](images/ui034-council-320.png)        |
| Costruzioni nel frasario, con mappa ancora visibile                            | [390 px](images/ui034-phrasebook-390.png)     |
| Scheda di una persona e rischio dei custodi                                    | [390 px](images/ui034-tribe-390.png)          |
| Scelte di una nuova storia                                                     | [390 px](images/ui034-newgame-390.png)        |
| Popoli e preparazione degli incontri                                           | [Desktop](images/ui034-world-1440.png)        |
| Puzzle con nomi interi e testo grande                                          | [320 px](images/ui034-puzzle-320.png)         |
| Primo avvio con azione stabile                                                 | [390 px](images/ui034-welcome-390.png)        |
| Deposito delle risorse                                                         | [390 px](images/ui034-stocks-390.png)         |

Le quattordici nuove prove in `premium-interface.spec.ts` verificano avvio raggiungibile, soluzione di un'intuizione con nomi interi, obiettivi non troncati, controlli dentro il telefono, nomi e quantità delle scorte abbondanti, densità del lessico, scelta delle modalità e il primo insegnamento interamente visibile dopo una vera spesa di legno. Controllano anche Attenzione, custodi, tempo e salvataggio dopo l'azione. Le prove esistenti continuano a verificare importazioni, recupero, effetti degli ordini, memoria, diplomazia, mappe e accessibilità.

Un secondo audit osserva 21 scene aggiuntive: benvenuto, aiuto, puzzle, scorte, preparazione stagionale, recupero, squadre, tradizioni, insediamento, fine partita e vittoria. La vittoria mostrata viene attivata dal motore a partire da uno stato preparato che ne soddisfa i requisiti, non assegnata direttamente alla schermata.

Gli assert legati alla vecchia impaginazione sono aggiornati per aprire i nuovi dettagli o leggere le nuove etichette. Le verifiche dei costi, dei custodi e dei salvataggi non vengono ridotte. Il workflow di pubblicazione esegue l'intera suite browser.

Verifica del rilascio:

- 115 file e 1.478 test unitari superati, senza errori non gestiti.
- 204 scenari browser esercitati: 203 superati nell'esecuzione integrale; il controllo rimanente confrontava 44 pixel con una misura Chromium di 43,999998. Dopo aver ammesso un solo subpixel di layout (1/64 px), il test sulle sei finestre è stato ripetuto e superato, conservando controllo del tocco, visibilità, scorrimento e chiusura.
- TypeScript, formattazione, build e avvio dell'artefatto reale sotto `/Lingus/` verificati. La build identifica versione e commit del rilascio.

Questa revisione fornisce evidenza di leggibilità e funzionamento nei casi esercitati. Il giudizio estetico e l'esperienza di persone nuove richiedono anche playtest sul dispositivo reale; il numero di test non costituisce una certificazione di qualità artistica.
