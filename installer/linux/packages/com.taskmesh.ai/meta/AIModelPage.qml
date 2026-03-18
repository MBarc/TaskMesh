import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12
import QtInstallerFramework 1.0

/**
 * AI Model Selection page — Linux installer (Qt Installer Framework)
 *
 * Shown after component selection when the AI component is selected.
 * Hardware detection runs in installscript.qs and stores:
 *   OllamaModel.Detected  — the hardware-recommended model tag
 *   OllamaModel           — the user's final choice (updated here on every click)
 *
 * Mirrors the Windows installer AIModelPage in taskmesh-setup.iss.
 */

DynamicPage {
    id: page
    objectName: "AIModelPage"
    title: qsTr("AI Model")
    shortTitle: qsTr("AI Model")

    // ── Model list (matches detect-hardware.sh tier table) ────────────────────
    property var models: [
        {
            tag:  "qwen2.5:32b",
            line: "qwen2.5:32b  —  Best quality",
            desc: "16+ GB GPU VRAM",
            size: "~20 GB download"
        },
        {
            tag:  "qwen2.5:14b",
            line: "qwen2.5:14b  —  High quality",
            desc: "32+ GB RAM or 8+ GB GPU VRAM",
            size: "~9 GB download"
        },
        {
            tag:  "llama3.1:8b",
            line: "llama3.1:8b   —  Balanced",
            desc: "16+ GB RAM or 4+ GB GPU VRAM",
            size: "~5 GB download"
        },
        {
            tag:  "llama3.2:3b",
            line: "llama3.2:3b   —  Lightweight",
            desc: "8+ GB RAM",
            size: "~2 GB download"
        },
        {
            tag:  "disabled",
            line: "Disable AI features",
            desc: "Skip AI setup — enable later from settings",
            size: ""
        }
    ]

    property string detected:    installer.value("OllamaModel.Detected", "llama3.1:8b")
    property string initialModel: installer.value("OllamaModel", detected)

    function modelIndex(tag) {
        for (var i = 0; i < models.length; i++)
            if (models[i].tag === tag) return i;
        return 2;  // fallback to llama3.1:8b
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 14

        // Header — hardware summary
        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            textFormat: Text.RichText
            text: detected === "disabled"
                ? "<b>Less than 8 GB of RAM detected.</b> AI features need at least 8 GB to run.<br>" +
                  "You can still install the AI files now and enable them later."
                : "Recommended for your hardware: <b>" + detected + "</b><br>" +
                  "Larger models are more capable but need more RAM and take longer to download."
        }

        // Divider
        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: "#cccccc"
        }

        // Radio buttons
        ButtonGroup { id: modelGroup }

        Repeater {
            id: modelList
            model: page.models

            delegate: RowLayout {
                Layout.fillWidth: true
                spacing: 10

                RadioButton {
                    ButtonGroup.group: modelGroup
                    checked: index === page.modelIndex(page.initialModel)
                    onCheckedChanged: {
                        if (checked)
                            installer.setValue("OllamaModel", page.models[index].tag)
                    }
                }

                ColumnLayout {
                    spacing: 1

                    RowLayout {
                        spacing: 6
                        Label {
                            text: modelData.line
                            font.bold: true
                        }
                        Label {
                            text: qsTr("★ recommended")
                            color: "#4f46e5"
                            font.pixelSize: 11
                            visible: modelData.tag === page.detected
                        }
                    }

                    Label {
                        text: modelData.desc
                              + (modelData.size !== "" ? "  ·  " + modelData.size : "")
                        color: "#555555"
                        font.pixelSize: 11
                    }
                }
            }
        }

        Item { Layout.fillHeight: true }
    }
}
