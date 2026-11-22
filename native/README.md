# PocketRippleLab – natív Android (Kotlin + OpenGL ES)

A webes PocketRippleLab natív változata: ugyanaz a vízszimuláció, ugyanazok a shaderek, ugyanazok a valódi 3D tárgyak és halak,
de Kotlinban, OpenGL ES 3.0-val, Jetpack Compose felülettel. Csak Android (APK); iOS még nincs.

## Felépítés (`native/android/app/src/main/java/hu/pocketripplelab`)

| Mappa | Tartalom |
| --- | --- |
| `water/` | `WaterSim` (hullámszimuláció), `WaterRenderer` + `Shaders` (a webes GLSL változtatás nélkül), `WaterScene` (a medence: fizika, érintés, rajzolás), `Settings` (SharedPreferences), `Tilt` (gravitációs érzékelő) |
| `world/` | tárgyak és halak: `Things`, `Body` (lebegés, billegés, átfordulás), `Fish` (halak viselkedése), `Physics`, `Shadows` (padlóárnyék) |
| `gl/` | `ObjectRenderer` (3D hálók), `Pack` (`.prm` olvasó), `Camera` + `Mat` (a padló doboz-nézetével azonos off-axis kamera) |
| `app/` | `UpdateManager` (OTA), `TapGate` (5 koppintás) |
| `ui/` | Compose: `PoolApp` (képernyő + beállítás-ikon), `SettingsSheet` |

A 3D hálók és textúrák **nincsenek lemásolva**: a Gradle a webes verzió `src/assets/` mappáját csomagolja az APK assetjei közé.

## Kiosk (gyerekzár)

* Az app teljes képernyős (immersive), a képernyő bekapcsolva marad.
* A gyerekzár (alapból be) képernyő-rögzítést (`startLockTask`) kér: a kezdőképernyő és a visszagomb nem lép ki az appból.
  Első indításkor az Android egyszer megerősítést kér.
* **Beállítások: 5 gyors koppintás a jobb felső ⚙ ikonon** (két koppintás között legfeljebb 1,2 mp; a pontok mutatják az előrehaladást).
  Nincs hosszú nyomás.
* A beállítások alján: gyerekzár ki/be, „Kilépés az alkalmazásból”, frissítés.

## A telefon döntése

A döntés **csak a nézőpontot** változtatja (padló, falak, halak, tárgyak ugyanabból a szemszögből látszanak): nem gyorsítja a tárgyakat,
nem billenti őket, és a víz sem hullámzik tőle. A tárgyak testfizikája (lebegés, ledobáskor billegés, átfordulás) külön van.

## Aláírt APK és kiadás (GitHub Actions)

`.github/workflows/native-build.yml` – egyetlen workflow, **Run workflow** gombbal indítható (vagy push a `main`-re a `native/**` módosításával).
Az aláírókulcs **egyszer** készül ugyanebben a workflow-ban, és utána minden build újrahasznosítja (három titok: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`).

### Első alkalom – kézi út (nem kell hozzá token)

1. Vegyél fel egy **`KEYSTORE_BACKUP_PASSPHRASE`** titkot (Settings → Secrets and variables → Actions → New repository secret): hosszú jelszó, legalább 12 karakter.
2. Indítsd a workflow-t. A `keystore` job legenerálja a kulcsot, és **ezzel a jelszóval titkosítva** (AES-256) kiadja a `signing-key-bundle-encrypted` artifactban (3 napig marad meg). A futás **Summary** oldala lépésről lépésre leírja, mit kell tenni.
3. Töltsd le az artifactot, és a gépeden bontsd ki:

   ```sh
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in keystore-bundle.enc -out bundle.tgz
   mkdir kulcs && tar -xzf bundle.tgz -C kulcs
   ```

4. A `kulcs` mappa három szövegfájlját másold be három repository titokba: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. A `release.keystore` fájlt őrizd meg biztonságos helyen (mentés).
5. Indítsd újra a workflow-t: megtalálja a titkokat, **nem készít új kulcsot**, aláírja az APK-t, ellenőrzi (`apksigner verify`), és Release-t készít `native-<dátum>-<futásszám>` címkével.

Csak annak a futásnak a csomagját használd, amelyik az utolsó volt: ha a titkok megadása előtt újra futtatod a workflow-t, új kulcs készül, és a régi csomag érvénytelen.

### Automata út (opcionális)

Ha van **`KEYSTORE_ADMIN_TOKEN`** titkod (fine-grained token ehhez a tárolóhoz, „Secrets: Read and write”), a workflow a három titkot maga állítja be, és magától újraindul; a token utána törölhető. Ha a `KEYSTORE_BACKUP_PASSPHRASE` is megvan, a titkosított mentés ilyenkor is elkészül.

### Utána

Minden további indítás ugyanazzal a kulccsal ír alá, így a telepített app felülírható és frissíthető. A kulcsot ne töröld és ne cseréld: másik kulccsal aláírt APK nem telepíthető a régi fölé (csak újratelepítéssel).

## OTA frissítés

Az app a `releases/latest` oldalon keres újabb APK-t (a címke utolsó száma a `versionCode`), a Beállítások → Frissítés alatt letölti, és
megnyitja a rendszer telepítőjét (első alkalommal az „ismeretlen források” engedélyét kéri). Működéséhez a tároló legyen nyilvános.

## Helyi build

```sh
gradle -p native/android assembleRelease    # aláíratlan APK, ha nincs ANDROID_KEYSTORE_FILE
```

Kell: JDK 17+, Android SDK (platform 35), Gradle 8.11+ (a repóban nincs `gradlew`; a CI az actionnel telepíti).
