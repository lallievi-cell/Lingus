# Una prima generazione in Guidata

La calibrazione A-59 modifica soltanto le età iniziali di cinque fondatori nelle
nuove partite Guidate. Korg passa da otto a sei stagioni, Ayla da dieci a otto,
Nara e Tala da sei a quattro, Oru da sette a cinque. Ilo rimane un bambino di due
stagioni e Uma conserva le dodici della calibrazione Guidata precedente. Tutti
gli altri tratti, sessi, scorte e parole iniziali rimangono identici.

La Classica mantiene i sette profili del documento, compresa Uma a quattordici
stagioni. Caricare o importare una storia conserva esattamente le età salvate:
la calibrazione appartiene alla creazione di una partita, non al caricamento.

## Motivazione e formule

Il problema osservato non era soltanto la disponibilità di cibo. Dopo il tempo
necessario a fuoco, scorte e alloggi, i fondatori originali avevano poche
occasioni riproduttive prima del passaggio alla vecchiaia. La finestra fertile
rimane fra quattro e tredici stagioni. Considerando i sei cambi stagionali dopo
le prime cinque stagioni di vita del villaggio, i profili originali offrono
cinque coppie-stagione; quelli Guidati ne offrono dieci. Il test calcola queste
opportunità con `pairFertileUnits`, senza trasformarle in nascite garantite.

Non cambiano probabilità di nascita, moltiplicatori della dieta o degli alloggi,
regole del partner, maturazione dei bambini, durata fertile o mortalità. Non si
forza il sesso dei nuovi nati e non si aggiungono clan, materiali o figli.
L'effetto consiste in un intervallo iniziale più ampio per costruire e nutrire
la comunità, mantenendo possibili i rischi demografici.

## Prova ordinaria limitata

`continuousCampaign.test.ts` esercita anche una nuova Guidata sul Seed Zero
6842 fino a 2040 secondi, cioè venti stagioni con il primo anno disteso. Il
pilota parte dai sette fondatori e dalle quattro parole innate. Il primo anno
è quello di `replayPatientOpening`; la continuazione usa soltanto ordini,
Scintille reali, insegnamento pagato e aggiornamenti ordinari.

Alla fine della prova si osservano diciotto persone, diciotto nascite e sette
morti per vecchiaia; nessuna morte per altre cause fino a quel punto. I
discendenti sono diventati a loro volta genitori. Rimangono ventisette posti
abitativi, circa 487 punti di nutrimento e Coesione 85. Le 163 azioni registrate
sono accettate dal gestore reale; le lezioni hanno consumato l'Attenzione
disponibile. Nessuna risorsa o persona viene introdotta dal pilota.

Il pilota mantiene il primo Tumulo prima di aggiungere alloggi marginali quando
ci sono cadaveri, conserva foraggio prima dell'inverno e distingue i recinti
inattivi da quelli mancanti. Queste sono scelte di gioco, non aumenti delle
rese. Senza queste priorità il villaggio poteva disperdersi per i cadaveri o
costruire altri recinti invece di rifornire quelli esistenti.

## Limite ancora aperto

La stessa strategia, lasciata proseguire, perde la continuità produttiva e si
disperde a 2259 secondi. Il picco resta diciotto persone. La prova a 2040
secondi dimostra una fase con ricambio dei fondatori, non la sostenibilità
indefinita né il percorso fino a trentacinque. Non equivale a una partita
osservata con un nuovo giocatore. La transizione da trentacinque alle città è
verificata separatamente da un insediamento preparato in
[MIDGAME-TRANSITION.md](MIDGAME-TRANSITION.md).
