# Spazio di lettura 0.3.6

## Pausa fuori dai messaggi

La pausa è indicata nel pulsante del tempo, con il simbolo di ripresa e la scritta «In pausa». Il vecchio avviso sopra la mappa è stato rimosso: le descrizioni del bersaglio restano libere. Il comando mantiene il nome accessibile «Riprendi il tempo» e una superficie di tocco di 44 px sui telefoni.

## Frasario e costruzioni

Sui telefoni verticali il catalogo compatto può occupare il 55% dell'altezza disponibile e copre temporaneamente il compositore durante la scelta, lasciando almeno 70 px della mappa. «Espandi» apre la consultazione quasi a tutto schermo; «Riduci» torna alla vista compatta. Su uno schermo da 390 × 744 px la lista passa da circa 242 a 561 px utili: nel campione verificato si vedono due frasi complete in compatto, cinque in espanso e quattro costruzioni in espanso.

Intestazione, sezioni e ricerca restano ferme; scorre solo l'elenco. Un cambio di sezione o ricerca riparte dalla prima voce completa. Espandere e ridurre conserva ricerca e dettagli aperti. La vista espansa attenua il gioco sullo sfondo e ne blocca i tocchi; gestisce Tab e Maiusc+Tab al proprio interno. Esc riduce il catalogo, poi un secondo Esc lo chiude.

«Prepara» chiude il catalogo e riporta al compositore con le parole impostate. La preparazione non esegue l'ordine e non spende Voce o materiali. Le costruzioni ancora sconosciute rimangono nascoste; la sezione vuota spiega come si riveleranno e permette di tornare alle frasi note.

## Verifica visiva

| Schermata                         | Anteprima                                            |
| --------------------------------- | ---------------------------------------------------- |
| Frasario compatto, 390 × 744      | [Immagine](images/ui036-phrasebook-compact-390.png)  |
| Frasario espanso, 390 × 744       | [Immagine](images/ui036-phrasebook-expanded-390.png) |
| Costruzioni espanse, 390 × 744    | [Immagine](images/ui036-construction-390.png)        |
| Scheda risorsa con gioco in pausa | [Immagine](images/ui036-pause-resource-375.png)      |

Le regressioni browser coprono 320 px con testo grande e contrasto alto, telefoni verticali, orientamento orizzontale, riduzione del viewport durante la ricerca, navigazione da tastiera e preparazione gratuita. I controlli della pausa verificano anche la separazione geometrica dalla scheda risorsa e dai comandi della mappa.
