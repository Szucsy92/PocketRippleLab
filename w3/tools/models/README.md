# Model export

Játék közben nincs sprite: minden bedobható tárgy és hal igazi 3D háló (`src/assets/models/*.prm`), amit az app
saját WebGL2-rendererrel rajzol (`src/lib/water/gl/`). Ez a mappa a hálók előállítása (Python: numpy, opencv, pillow).

```sh
# forrás-modellek: ../../assets-src/{alien-fish,clown-fish,beach-ball-free-download,rubber-duck-toy}/...
python3 export_static.py ball ring duck   # strandlabda (GLB), mentőgyűrű (procedurális tórusz), gumikacsa (FBX)
python3 export_boat.py                    # vitorlás (procedurális háló)
python3 export_fish.py clown alien        # bohóchal + idegen hal: az FBX csontvázas animációk vertex-képkockákra sütve
```

A `.prm` ("mesh pack") egy JSON fejléc + bináris blokkok (`pack.py` írja, `gl/pack.ts` olvassa), a nagyobbak
nyers deflate-tel tömörítve (`PRMZ`). A modell-egység a tárgy sugara (`t.r`); a halak hossza 1 egység, az origó az orruktól
a hossz 0,444-ed részénél van. A `waterline` (merülési vonal) a `things.ts` `BODY` táblájával egyezik, ezt teszt őrzi.

A mentőgyűrű és a vitorlás saját modell; a feltöltött gyűrű- és labdaképek csak színreferenciák voltak.
