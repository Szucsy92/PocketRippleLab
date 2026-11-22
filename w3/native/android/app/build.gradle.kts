plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "hu.pocketripplelab"
    compileSdk = 35
    defaultConfig {
        applicationId = "hu.pocketripplelab"
        minSdk = 26
        targetSdk = 35
        // A CI felülírja a verziót (APP_VERSION_CODE / APP_VERSION_NAME); helyben marad az alapérték.
        versionCode = System.getenv("APP_VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("APP_VERSION_NAME") ?: "1.0.0"
        // A frissítés-ellenőrzés a CI-ban a GITHUB_REPOSITORY (tulajdonos/repó) alapján keres; helyi buildnél üres = kikapcsolva.
        val updateRepo = System.getenv("GITHUB_REPOSITORY") ?: ""
        buildConfigField("String", "UPDATE_REPO", "\"$updateRepo\"")
    }
    // Aláírás csak akkor, ha a CI megadja a kulcstárat (környezeti változókból, soha nem a forrásból).
    val keystorePath = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        if (!keystorePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "pocketripplelab"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // A 3D hálók és textúrák a webes verzióval közös src/assets mappából kerülnek az APK-ba (nincs másolat).
    sourceSets {
        getByName("main") {
            assets.srcDir("../../../src/assets")
        }
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation(platform("androidx.compose:compose-bom:2025.03.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.ui:ui-text")
    testImplementation("junit:junit:4.13.2")
}
