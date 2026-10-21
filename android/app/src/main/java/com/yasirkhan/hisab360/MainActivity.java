package com.yasirkhan.hisab360;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.graphics.Color;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(242, 245, 248));
        WindowCompat.getInsetsController(getWindow(), content).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), content).setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = windowInsets.getInsets(types);
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return new WindowInsetsCompat.Builder(windowInsets).setInsets(types, Insets.NONE).build();
        });
        ViewCompat.requestApplyInsets(content);
    }
}
