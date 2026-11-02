# Memoria del sapere

La sezione «Le voci del sapere» al Falò collega le parole alle persone che le custodiscono. Mostra i custodi viventi, evidenzia l’ultima voce anziana o in pericolo, permette di inquadrarla e usa le condizioni effettive di `getLessonPreview` per abilitare una lezione.

Le nuove scoperte e le lezioni completate registrano il vero scopritore oppure insegnante e allievo. Il registro è aggiornato dalle API pubbliche `solveSpark` / scoperta contestuale e `teachWord`, dopo l’assegnazione del sapere e il pagamento della lezione. Anteprime e piani non eseguibili non producono eventi nello stato della partita. Gli eventi non consumano numeri casuali, risorse aggiuntive o identificatori della simulazione.

Il registro conserva al massimo 200 eventi. Se una scoperta iniziale è uscita dal registro, una successiva riscoperta non viene presentata come origine della parola: l’attribuzione della prima voce richiede la corrispondenza con la prima data effettiva in `bornWords`. I vecchi salvataggi restano compatibili e non ricevono retroattivamente scopritori o insegnanti ipotetici. Gli attori morti restano nella memoria e non offrono un comando per inquadrarli sulla mappa.

La parentela proviene esclusivamente dagli identificatori dei genitori. Una parola condivisa fra genitore e figlio non implica che la lezione sia avvenuta fra loro; la sezione distingue la famiglia dalle trasmissioni registrate. Prima di «Io» i nomi personali restano nascosti; prima di «Numero» il pannello descrive qualitativamente il sapere condiviso.

## Verifica

`npx vitest run src/game/knowledgeHistory.test.ts src/game/knowledgeLineage.test.ts src/game/lessonPlan.test.ts src/game/knowledgeRecovery.test.ts --maxWorkers=2`: 62 test superati.

Le prove comprendono scoperte e riscoperte tramite `solveSpark`, lezioni pagate tramite `teachWord`, salvataggio e caricamento della storia, rifiuto dei registri importati non validi, limite del registro, anonimato, morti e legami familiari distinti dagli insegnanti. Questi test verificano il modello e il markup del pannello; non sostituiscono una sessione osservata con un nuovo giocatore.
