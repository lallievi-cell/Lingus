# Lingus — specifica operativa e criterio di fedeltà

La fonte è il documento `lingus.docx` allegato dall'utente. Il testo raccoglie una conversazione di progettazione con esempi, correzioni e passaggi ancora sottodeterminati. Le domande presenti nel documento non sono nuove istruzioni operative. [DECISIONS.md](DECISIONS.md) esplicita i valori e i criteri adottati nei punti indefiniti; [REMAINING.md](REMAINING.md) separa le verifiche ancora aperte. Le correzioni esplicite più recenti prevalgono sugli esempi precedenti.

L'obiettivo della revisione è implementare l'arco dall'Istinto all'Età del Ferro secondo le regole definitive, eliminando le facilitazioni arbitrarie del primo prototipo. La conformità non si misura contando componenti o test: [CONFORMANCE.md](CONFORMANCE.md) conserva requisiti, riferimenti, prove e limiti di ciò che la fonte determina davvero.

## Un solo linguaggio, sei ere

Il lessico contiene 45 token: nove soggetti, quattordici verbi, quattordici oggetti, cinque modificatori e tre condizioni. Preda/Carne è anche il selettore alimentare generale: le risorse fisiche rimangono distinte, senza introdurre nuove parole Cibo o Raccogliere.

Le quattro parole iniziali sono Gruppo, Andare, Mangiare e Colpire. Un ordine è una frase; il motore traduce la frase in un comportamento delle persone, delle classi sociali, degli eserciti o delle città. Le costruzioni sono conseguenze di ricette linguistiche, non acquisti da un menu edilizio.

| Tier raggiunto            | Slot | Requisiti definitivi                                                    | Tradizioni / dogmi / leggi |
| ------------------------- | ---- | ----------------------------------------------------------------------- | -------------------------- |
| 0 — Istinto               | 2    | Stato iniziale                                                          | 0 / 0 / 0                  |
| 1 — Paleolitico inferiore | 3    | Almeno due parole del Tier1, comprendendo Io oppure Qui                 | 0 / 0 / 0                  |
| 2 — Paleolitico superiore | 4    | Otto parole con ritenzione almeno50, Domani oppure Fuoco                | 0 / 3 con Menhir / 0       |
| 3 — Neolitico             | 5    | Sedici parole stabili, Sempre, popolazione almeno35                     | 3 / 3 / 0                  |
| 4 — Bronzo                | 6    | Venticinque parole stabili, Metallo e Altrimenti, popolazione almeno150 | 5 / 6 con Tempio / 3       |
| 5 — Ferro                 | 6    | Trentacinque parole stabili, Archivio e Palazzo                         | 8 / 6 / 6                  |

Oltre due stagioni consecutive sotto la soglia stabile bloccano l'ultimo spazio fino al ripristino. Sei è il limite massimo: il concatenamento di macro è stato eliminato dalla correzione finale.

**Portare ha destinazione implicita Qui.** La frase Gruppo + Portare + Pietra funziona con tre slot. I pattern accettano anche due oggetti e riusano token come argomenti semantici quando le ricette lo richiedono. Le leggi hanno sei slot e distinguono prescrizione da divieto mediante Pericolo nel quarto spazio. L'emancipazione Sempre + Gruppo + Libero è l'eccezione senza verbo esplicitamente usata dalla condizione filosofica.

## Stato iniziale e mondo fisico

La mappa misura 500×500 metri ed è divisa in 25 settori da100×100 metri. La fase individuale comincia nel settore centrale; il passaggio urbano rende significativa l'intera regione. Il Seed Zero comprende i sette profili numerici e le risorse elencate nel registro di conformità: tre cespugli con60 bacche, quindici alberi con300 legno, due rocce con200 pietra, sei cervi, due lupi e una vena con500 minerale.

Una stagione dura90 secondi:60 di giorno,30 di notte. Quattro stagioni formano un anno; l'inverno comincia al secondo270. Velocità2× e4× accelerano il tempo di simulazione; le pause e i puzzle lo arrestano.

La percezione è progressiva:

| Scoperta       | Informazione o capacità                                            |
| -------------- | ------------------------------------------------------------------ |
| Io             | Selezione e osservazione individuale.                              |
| Pietra / Legno | Colore, riconoscimento e selezione mirata del materiale.           |
| Notte          | Orologio giorno/notte.                                             |
| Domani         | Scorte e pianificazione stagionale.                                |
| Fuoco          | Calore e Falò. La prima costruzione richiede cinque legna reali.   |
| Morte          | Coesione e lutto.                                                  |
| Sacro          | Pietra Sacra e dogmi.                                              |
| Metallo        | Vene minerarie.                                                    |
| Numero         | Quantità e percentuali esatte al posto di descrizioni qualitative. |
| Confine        | Perimetro territoriale di35m, poi100m conPalazzo.                  |

Le risorse sconosciute continuano a esistere come ostacoli e possono essere colpite per farne esperienza. Gli ordini di gruppo usano il raggio di quindici metri del cursore; Io richiede un individuo scelto separatamente dal bersaglio dell'azione.

## Equazioni e collegamenti essenziali

La fame base cresce di0,8 al secondo. A100 causa due danniHP al secondo. La salute recupera0,5/s con fame non superiore a20 presso la tana. La temperatura varia secondo `(Tamb−50)×0,1 + Fuoco + Vestiti`; l'ipotermia a20 rallenta e infligge1,5HP/s. Le temperature giorno/notte sono55/45,75/55,50/35,20/5 per le quattro stagioni. In inverno i cespugli non producono cibo.

La tensione cognitiva ambientale è individuale: `Σ peso × (Intelligenza/5) × exp(−0,05×età_evento)`, considerando gli ultimi60 secondi. La versione più recente del documento definisce Intelligenza/5; il precedente intervallo0,8–1,5 è quindi una formulazione superata. La correzione sugli eventi di lavoro introduce separatamente impulsi da20 per ciclo verso la scoperta collegata: questa interpretazione rende operativa la sua affermazione cinque cicli→100 senza far finta che cinque eventi distanziati non decadano.

La Scintilla dura45 secondi. Un errore sottrae35 tensione, chiude il puzzle e impone15 secondi di attesa. La parola appena acquisita ha ritenzione50 e un primo custode. L’insegnamento preferisce un minore idoneo; in sua assenza sceglie un adulto non anziano, senza attribuire custodia agli schiavi. Le parole innate restano a100. La formula stagionale è `1,5×usi +10×investimento_normalizzato −3×complessità×(1−supporto)`. Dieci punti reali di Attenzione corrispondono a un investimento normalizzato e a dieci punti di ritenzione: non vanno contati due volte tra insegnamento e fine Falò.

Non sono previste né la grazia fino al secondo270 né il bonus immediato di ritenzione per clic del vecchio prototipo. La morte di un custode applica `Rw×(1−1/Ncustodi)`; la perdita dell'ultimo porta a zero. Stele e Archivio hanno supporto0,95 e1; i loro effetti dipendono dal supporto fisico e, quando richiesto, dai lavoratori.

L'Attenzione è `clamp(5×legna_bruciata +10×anziani −fame_media,0,Pmax)`, normalmente conPmax100. Non esiste un minimo garantito. La morte senile ha probabilità zero fino a14 stagioni, poi `(età−14)×12%`, limitata a100%.

## Inventari, lavoro e società

Bacche, carne cruda e carne cotta sono risorse distinte: saziano25,40 e60 e perdono50%,60% e25% a stagione. Restano separati pietra, legno, pelli, semi, minerale, lingotti, utensili, lance, ceramica, armi metalliche e moneta. I moltiplicatori di conservazione non sostituiscono i tassi base: il Pozzo riduce il marciume del20%, la ceramica lo dimezza, l'estate lo moltiplica per1,5.

Il mucchio a terra contiene30 unità materiali totali. Pozzi e Depositi aggiungono capacità dedicate di200 cibo e500 materiali per edificio; la moneta è astratta e illimitata. La raccolta interrompe l'estrazione a magazzino pieno. Utensili e armi sono contatori frazionari globali: usura0,10 per nodo,0,05 per preda,0,02 per secondo di combattimento metallico.

Un edificio produttivo ha efficienza `lavoratori_presenti/lavoratori_massimi`; uno passivo non richiede lavoratori. Prima delle città, i lavoratori devono arrivare fisicamente e liberano lo slot per mangiare o dormire. Dopo la condensazione, l'allocazione avviene per coorti cittadine. La manutenzione è pagata una volta per stagione: mancato pagamento significa inattività e perdita del20% degli HP massimi.

Le priorità sono dogma, sopravvivenza critica, fuga appresa, ordine diretto, tradizione e istinto. Le tradizioni evitano il costo ripetuto della voce. La proprietà produce disuguaglianza; le caste servili producono tensione, con conseguenze e possibilità di emancipazione. Le variabili narrative per spie, criminalità, disoccupazione, mercenari e immigrazione non diventano sistemi autonomi: la fonte le riconduce alle meccaniche esistenti.

## Dogmi, leggi e scala imperiale

Il documento propone26 concetti sacralizzabili e otto famiglie di vettori. La regola generale e gli archetipi specifici non definiscono ogni coppia nello stesso modo: per esempio Preda+Pericolo è vegetarianesimo, non divieto di qualsiasi cibo. Gli effetti esposti devono avere un'azione concreta e un'anteprima corretta. Non si presenta il numero teorico208 come prova di208 effetti numerici completamente definiti ed eseguiti.

Un dogma legato a un trauma recente recupera40 coesione. Il suo peso cresce secondo `10×1,08^stagioni`; abolirlo costa il peso accumulato. La filosofia erode i dogmi di15 per stagione. Le leggi applicano sanzioni o incentivi e possono entrare in conflitto con i dogmi.

A150 abitanti e conCittà, la comunità si condensa in un nodo urbano con quattro coorti. I materiali sono locali, moneta e memoria imperiali. Ogni città può avere due vocazioni. Una colonia parte con30 cittadini e50 legno,50 pietra,50 cibo. L'espansione residenziale costruisce quattro case:80 pietra,40 legno,+48 alloggi e4 pietra di manutenzione.

Il tributo è25% della produzione stagionale e viaggia fisicamente. La corruzione è `min(0,8, distanza_settori×0,15×(1−0,5×tribunale)×(1−0,3×macchina))`. I carichi non si accreditano una seconda volta se intercettati o trasferiti. La comprensione linguistica è la similarità di Jaccard dei vocabolari; i delegati insegnano due parole per stagione alle province.

I battaglioni hanno20 soldati e2000HP. Le catapulte fanno200 danni/s alle strutture; l'annessione richiede mura e guarnigione sconfitte e30 secondi di occupazione. Gli eserciti hanno mantenimento e conseguenze demografiche reali.

## Conclusione e limiti della dichiarazione di fedeltà

Le tre vittorie richiedono il Tier5: dominio di tutte le città con almeno cinque leggi e rivolta sotto30 per sedici stagioni; tutte le45 parole a100 conArchivio e intelligibilità almeno80%; oppure superamento filosofico dei dogmi, emancipazione e coesione almeno90 senza dogmi attivi. Le sconfitte sono estinzione, dispersione per coesione esaurita e perdita di tutti gli insediamenti.

La fonte lascia parametri non numerati e alcune contraddizioni: età adulta convertita in stagioni, alloggi iniziali, tasso riproduttivo della fauna, tempi di lavoro/costruzione, prezzi di scambio, penalità traumatiche e matrice degli opposti. I valori scelti sono esportati come `SPEC_ASSUMPTIONS`, `CORE_DEFAULTS` e `IMPERIAL_ASSUMPTIONS`; non sono formule letterali della fonte.

Anche il collo di bottiglia della scrittura richiede una risoluzione dimensionale: tutte le complessità sommano252 e l'erosione massima base è756, inferiore al vecchio confronto `10×100=1000`. Con l'insegnamento finale normalizzato,100 punti reali di Attenzione producono100 punti di recupero, rendendo raggiungibile il sovraccarico orale. Per il primo fuoco prima di Portare, la decisione adottata consente di usare materiali realmente estratti entro15m dall’artigiano o dal Falò. Nessuna risorsa è regalata per nascondere quel vincolo.

Il registro di conformità documenta queste decisioni e separa test delle formule, test di integrazione e prove di raggiungibilità in una partita ordinaria. Un successo ottenuto preparando uno stato avanzato prova il sistema in quello stato, non l'intero percorso dall'inizio.
