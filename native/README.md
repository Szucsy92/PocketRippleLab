# Víztükör – natív Android (Kotlin + OpenGL ES)

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

A `.github/workflows/native-build.yml` a RepoPush rendszeréhez hasonlóan kezeli az Android aláírókulcsot.

- **Első futás:** ha még nincs `signing` ág, a workflow létrehoz egy RSA-4096 aláírókulcsot, titkosítja, majd a `signing` ágra menti a `release.keystore.enc` fájlt. A visszafejtéshez szükséges jelszó ugyanitt, a `keystore.pass` fájlban van.
- **Automatikus folytatás:** az első futás elindít egy új workflow-futást. Ez visszaállítja a kulcsot, aláírja az APK-t, ellenőrzi az aláírást, majd GitHub Release-t készít.
- **További build-ek:** mindig ugyanazt a `signing` ágon tárolt kulcsot használják, ezért az új APK a korábbi alkalmazásra frissítésként telepíthető.

A `signing` ág külön van a `main` ágtól, így a forráskód teljes cseréje nem törli a kulcsot. **Ne töröld a `signing` ágat, és ne módosítsd a benne lévő fájlokat.**

Opcionálisan beállítható az `ANDROID_KEYSTORE_PASSWORD` repository secret is. Ha megadod, annak pontosan meg kell egyeznie a kulcs létrehozásakor használt jelszóval. A korábban `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` és `ANDROID_KEY_ALIAS` secretben tárolt kulcsot az első futás átveszi a `signing` ágra, nem generál helyette újat. Alapértelmezésben nincs szükség kézzel felvett secretre vagy külön tokenre: a workflow a saját `GITHUB_TOKEN` jogosultságát használja.

Indítás: GitHub → **Actions** → **Natív Android build – aláírt APK** → **Run workflow**. Az első futás a kulcsot készíti elő és automatikusan elindítja a következőt; a második futás készíti el az aláírt APK-t és a Release-t.

## OTA frissítés

Az app a `releases/latest` oldalon keres újabb APK-t (a címke utolsó száma a `versionCode`), a Beállítások → Frissítés alatt letölti, és
megnyitja a rendszer telepítőjét (első alkalommal az „ismeretlen források” engedélyét kéri). Működéséhez a tároló legyen nyilvános.

## Helyi build

```sh
gradle -p native/android assembleRelease    # aláíratlan APK, ha nincs ANDROID_KEYSTORE_FILE
```

Kell: JDK 17+, Android SDK (platform 35), Gradle 8.11+ (a repóban nincs `gradlew`; a CI az actionnel telepíti).
