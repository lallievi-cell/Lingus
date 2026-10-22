# Verifica delle quattro segnalazioni

Riferimento iniziale: commit `668608b`. Le quattro segnalazioni individuano difetti reali. Le correzioni seguono il testo di `lingus.docx`, comprese le distinzioni sotto riportate.

## 1. Chiusura della stagione

Il tempo viene incrementato prima delle operazioni stagionali. Di conseguenza, leggere soltanto la stagione corrente anticipava il marciume estivo, il raccolto e le manutenzioni limitate a una stagione.

Le operazioni di chiusura usano ora la stagione appena conclusa; il sorteggio del meteo e la rigenerazione primaverile usano quella appena iniziata. La correzione comprende i villaggi, le città, le province e la produzione straniera. Le vecchie scorte marciscono prima del nuovo raccolto; i moltiplicatori alimentari non si applicano a legno e pelli. Le prove dei doveri appartengono alla stagione conclusa anche quando il fotogramma oltrepassa il confine, per esempio a 270,03 s.

| Evento                                                | Momento corretto     |
| ----------------------------------------------------- | -------------------- |
| Marciume primaverile e seme di manutenzione del Campo | 90 s, fine primavera |
| Marciume estivo ×1,5                                  | 180 s, fine estate   |
| Raccolto del Campo                                    | 270 s, fine autunno  |
| Vegetali invernali di manutenzione del Recinto        | 360 s, fine inverno  |

La manutenzione a fine stagione è esplicita nella fonte, paragrafi 2164–2173. Il raccolto dipende ancora dagli addetti effettivi; i costi restano reali. `seasonBoundary.test.ts` verifica le quattro chiusure, il passaggio tramite `tick`, le province, i disastri e la rigenerazione.

## 2. Caccia Grossa

La frase `S + Colpire + Preda + Pericolo` selezionava anche cervi, lupi e carne a terra. Ora seleziona soltanto predatori alfa e mammut entro il raggio di caccia di 100 m. Un clic su un cervo non aggira il filtro, neppure in una tradizione.

La fonte, paragrafo 746, indica specificamente alfa e mammut: non è stato aggiunto un ripiego automatico sui lupi. La caccia ordinaria conserva la scelta della fauna ordinaria. `huntRules.test.ts` contiene i test di regressione.

## 3. Gerontocrazia e Oligarchia Sacerdotale

I coefficienti `gamma` e `teaching` esistevano ma nessun ramo attivava gli effetti dell’archetipo. I paragrafi 350–353 distinguono due fasi:

- Gerontocrazia: precedenza alimentare e immunità alla perdita di HP per fame degli anziani, insegnamento al Falò +25%.
- Oligarchia nell’Età del Bronzo: oblio γ = 0,5 e soglia di ribellione dei Forti ridotta del 30%.

La forma canonica è `Saggio + Sacro + Mio`; la forma storica esatta `Saggio + Sempre + Mio` viene normalizzata nello stesso dogma, con i normali prerequisiti della Pietra Sacra. La sola venerazione `Saggio + Sacro + Sempre` mantiene i suoi effetti generici.

Poiché l’insegnamento è istantaneo, il bonus aumenta il recupero base da 10 a 12,5 memoria, conservando il costo di 10 Attenzione, un nuovo custode e il normale incremento di Intelligenza. L’immunità alla fame non protegge dal freddo, dalle malattie o dai colpi. I test verificano sia i coefficienti sia gli effetti su consumo, salute, ritenzione e insegnamento effettivi.

## 4. Privilegio alimentare di casta

La frase `S + Mangiare + Preda + Mio` era accettata, ma si comportava come un pasto normale. Ora registra una priorità delle scorte persistente, conservata nel salvataggio e indipendente dall’azione successiva.

La priorità individuale usa i sette selettori umani (Gruppo, Io, Forte, Saggio, Straniero, Schiavo e Re) e si applica alle persone corrispondenti al soggetto quando sono affamate e condividono fisicamente lo stesso magazzino. `Io` identifica la persona scelta; Forte, Saggio e Schiavo seguono il rispettivo selettore. Il privilegio dogmatico degli anziani prevale sulla priorità ordinata. Nessun cibo viene creato o riservato per una persona lontana.

La durata non era precisata dalla fonte: la priorità rimane fino a un nuovo ordine di privilegio. L’ultimo ordine sostituisce quello precedente. La validazione dei salvataggi rifiuta politiche malformate e conserva la compatibilità con quelli precedenti privi del campo opzionale.

I criteri di rappresentazione e persistenza sono esplicitati anche in [DECISIONS.md](DECISIONS.md). [CONFORMANCE.md](CONFORMANCE.md) conserva il conteggio delle prove svolte e i limiti della verifica complessiva.

## Verifica della revisione

- Al commit `57500b7`: **541 test unitari e di integrazione superati**, di cui **62 nuove regressioni** sui quattro punti e sugli effetti collegati.
- **11 test nel browser superati**; build TypeScript/Vite e formattazione verificate.
- Il replay ordinario conserva il Seed Zero **6842** e tutte le asserzioni precedenti. La strategia ora include due pasti autunnali vicini alla tana e il rientro anticipato per la terza notte. Raggiunge il traguardo a **360 s**, con **7 persone vive, 18 parole, Falò e Pozzo propri**, usando soltanto comandi, Scintille e insegnamento pagato. Questo replay non dimostra la sopravvivenza a ogni possibile disastro.

La revisione successiva dei turni e dei custodi è descritta in [GROWTH-AUDIT.md](GROWTH-AUDIT.md). I numeri del replay sopra fotografano il commit `57500b7`; dopo le modifiche dell’utente alle notti di Qui, il percorso viene verificato nuovamente senza imporre lo stesso esito numerico.
