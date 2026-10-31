# Scorte visibili al campo

Le risorse consegnate erano conservate correttamente, ma non venivano disegnate. Il riepilogo richiedeva Domani e mostrava soltanto cibo, legno e pietra; l’inventario esteso poteva nascondere materiali posseduti, comprese le pelli, se mancava la parola associata.

Il pulsante **Scorte** sulla mappa è disponibile dall’inizio. Mostra ogni materiale posseduto, anche senza il relativo concetto, e distingue le quantità già disponibili dai carichi realmente in ritorno al campo. Le risorse iniziali osservabili rimangono nell’elenco anche quando non ne resta: bacche, carne cruda, pietra, legno e pelli. Per i materiali successivi compaiono anche le voci vuote associate a parole già scoperte, comprese quelle poi dimenticate.

Prima di Numero, le quantità sono descritte come «Nessuna scorta», «Poco», «Una discreta scorta» e «Molto». Queste fasce indicano la quantità, non la capacità di superare una stagione. Il riepilogo usa etichette più brevi per entrare anche sul telefono. Dopo Numero vengono mostrate le quantità: un residuo positivo inferiore al decimo appare come «<0,1», evitando un falso zero. Anche l’anno della stagione rimane qualitativo prima di Numero.

## Rappresentazione sulla mappa

Presso il giaciglio compaiono fascine legate, pietre ordinate, alimenti su vassoi, pelli su un supporto e altri beni su una stuoia. L’aspetto varia per fasce qualitative; non esiste un oggetto disegnato per ciascuna unità. I gruppi assenti non vengono disegnati. Le posizioni restano stabili quando cambiano le quantità e si adattano agli edifici; la rappresentazione rispetta visibilità e profondità della mappa.

Le scorte disegnate leggono direttamente `state.resources`. Non sono nuove entità raccoglibili, non occupano percorsi e non modificano capacità, conservazione o risorse. I cumuli presso i nodi estratti restano invece materiale **a terra, da portare**. Toccare le scorte apre l’inventario quando non si sta impartendo un ordine; persone e altri bersagli mantengono la precedenza. Durante un ordine pronto, il terreno resta selezionabile normalmente.

Il pannello usa la capacità reale del motore: trenta posti condivisi iniziali, poi spazi separati per alimenti e materiali con i rispettivi magazzini. I carichi prenotano spazio senza essere sommati ai beni già consegnati. La moneta non occupa spazio. Con l’urbanizzazione, il pulsante identifica le scorte della capitale; gli inventari delle province restano separati e i cumuli del vecchio campo non vengono disegnati.

Questa modifica di presentazione vale anche per le partite salvate: non richiede una nuova storia e non cambia le formule della simulazione.

## Verifiche

- `src/components/campInventory.test.ts`: quattordici prove su materiali, conoscenze, assenza, frazioni, carichi, capacità condivise e dedicate, province, stabilità, edifici e presentazione senza numeri.
- `tests/camp-stocks.spec.ts`: interazione reale su desktop e telefono, accesso prima di Domani, tutte le quattordici risorse, trasporto reale, quantità esaurite e positive, riepilogo compatto e selezione dei bersagli durante gli ordini.
- Le scene grafiche con materiali assegnati sono fixture di presentazione, non prove di crescita o raccolta ordinaria. Il caso di trasporto usa invece un comando e una consegna reali del motore.

Immagini di riferimento: [mappa mobile](images/camp-stocks-map-390.png) e [inventario mobile](images/camp-stocks-inventory-390.png).
