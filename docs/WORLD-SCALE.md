# Scala del mondo e navigazione

La scelta **Mondo**, introdotta nella 0.10.0, collega **sedici regioni da 1.000 × 1.000 metri**, in una griglia di quattro per quattro: **16 km²**. **Casuale** conserva la regione costiera della 0.9.0; **Seed Zero** conserva la valle originaria. La scelta della geografia resta indipendente da Guidata e Classica. Le partite precedenti non vengono ampliate.

## Una geografia condivisa

Il Mondo comprende due grandi masse terrestri, cinque isole e un bacino interno. Coste, confini terrestri e fiumi sono derivati dalle stesse coordinate globali: il bordo di una regione continua in quella vicina. Grafica e percorsi usano la medesima geometria. Le forme principali seguono una struttura iniziale comune; il seed varia i dettagli delle rive e le risorse. Non è ancora un generatore di ogni possibile disposizione di continenti.

Il campo iniziale conserva sette fondatori e otto culture. Le altre regioni vengono generate all’arrivo, senza duplicare persone, città o scorte. Le loro risorse sono nodi finiti. Questa prima espansione non popola automaticamente ogni continente con nuove culture e non introduce commercio navale o colonizzazione marittima autonoma delle altre società.

## Osservazione e viaggio

L’**Atlante** si apre dalla mappa. Le regioni sconosciute non rivelano terreno o risorse. Osservare una regione già visitata cambia la visuale e lascia le persone al loro posto.

Per viaggiare, scegli un gruppo o una barca con equipaggio, apri l’Atlante e prepara il passaggio verso una regione adiacente. La preparazione compone **Gruppo · Andare · Qui** e sceglie un vero punto del confine: l’ordine parte con **Pronuncia** e costa la Voce ordinaria. Non esiste un trasferimento istantaneo tra caselle.

Il gruppo raggiunge fisicamente il bordo sulla terraferma, oppure l’equipaggio naviga lungo una rotta d’acqua. Il passaggio conserva identità, salute, bisogni, carichi personali e stiva; le scorte lasciate nella regione di partenza restano lì. Il primo arrivo asciutto può stabilire un bivacco di riferimento, senza alloggi o materiali gratuiti. I contingenti cittadini, gli eserciti e le carovane non attraversano ancora i confini mondiali.

## Simulazione e limiti

Il mondo condivide calendario, Voce, linguaggio e memoria. Le regioni generate continuano a simulare bisogni, lavoro e bilanci locali anche fuori dalla visuale. Non vengono rigenerate quando si torna; riserve esaurite e oggetti costruiti restano salvati. I soli territori mai visitati restano privi di simulazione materiale.

La griglia di navigazione e la superficie del terreno restano locali, con il limite grafico di 3.600 × 2.400 pixel. Il mondo è limitato a sedici regioni: non è ancora una simulazione illimitata, un sistema di chunk scaricati o una rappresentazione compressa delle sole differenze rispetto al seed. Il salvataggio conserva i dati completi delle regioni generate.

Le prove tecniche di geometria, trasferimenti, calendario e persistenza sono distinte dalle campagne ordinarie prolungate, rimandate su richiesta. Espandere ulteriormente la scala richiede misurare memoria, salvataggi, rifornimenti e tempi di traversata sui telefoni. [RELEASE-0100.md](RELEASE-0100.md) descrive questa prima implementazione.
