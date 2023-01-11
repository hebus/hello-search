import { Component, Input, Output, ViewChild, ElementRef, EventEmitter, ContentChild, OnChanges, SimpleChanges, ChangeDetectorRef, OnInit, OnDestroy, ChangeDetectionStrategy } from "@angular/core";

import { Utils } from "@sinequa/core/base";
import { PreviewDocument } from "@sinequa/components/preview";

import { DocumentCacheService } from "./document-cache-parser";


/**
 * This component manages the iframe containing the document's preview.
 * The main input is the URL of the document's preview.
 * The main output is an event emitter providing an instance of PreviewDocument.
 *
 * PreviewDocument is a wrapper around the HTML Document, allowing to interact with
 * the HTML of the preview (for example to highlight some entities)
 *
 * It is possible to insert a tooltip in the preview via transclusion.
 * Example:
    <sq-preview-document-iframe
        [downloadUrl]="downloadUrl"
        (onPreviewReady)="onPreviewReady($event)">
        <sq-preview-tooltip #tooltip
            [previewDocument]="previewDocument"
            [previewData]="previewDocument">
        </sq-preview-tooltip>
    </sq-preview-document-iframe>
 */
@Component({
    selector: "sq-preview-document-iframe-v2",
    template: `
                <iframe #documentFrame
                    loading="lazy"
                    sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts">
                </iframe>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [`
:host{
    flex: 1;
}


iframe {
    background-color: white;
    flex: 1;
    position: relative;
    top: 0;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    border: 0;

    -moz-transform-origin: 0 0;
    -o-transform-origin: 0 0;
    -webkit-transform-origin: 0 0;

    transition: opacity 0.2s ease-in-out;
}

.spinner-grow {
    width: 3rem;
    height: 3rem
}
    `]
})
export class PreviewDocumentIframeV2Component implements OnChanges, OnInit, OnDestroy {
    @Input() downloadUrl: string;
    @Input() scalingFactor: number = 1.0;
    @Output() onPreviewReady = new EventEmitter<PreviewDocument>();

    // page could change when location.href change or when user click on a tab (sheet case)
    // when URL a string is sent otherwise a PreviewDocument
    @Output() pageChange = new EventEmitter<string | PreviewDocument>();
    @ViewChild('documentFrame', {static: true, read: ElementRef}) documentFrame: ElementRef;  // Reference to the preview HTML in the iframe
    @ContentChild('tooltip', {read: ElementRef, static: false}) tooltip: ElementRef; // see https://stackoverflow.com/questions/45343810/how-to-access-the-nativeelement-of-a-component-in-angular4
    @ContentChild('minimap', {read: ElementRef, static: false}) minimap: ElementRef; // see https://stackoverflow.com/questions/45343810/how-to-access-the-nativeelement-of-a-component-in-angular4

    // Must be undefined by default, because if a default value is set,
    // if we set it to undefined in the future, this new (undefined) value
    // is not used by the iFrame as if it used the previous value
    public _sandbox: string | null | undefined;

    private previewDocument: PreviewDocument;
    readonly previewDocLoadHandler;

    constructor(
        private documentCacheService: DocumentCacheService,
        private cdr: ChangeDetectorRef) {

        this.previewDocLoadHandler = this.onPreviewDocLoad.bind(this);

        this.documentCacheService.blobUrl.subscribe(value => {
            this.downloadUrl = value;
            this.documentFrame.nativeElement.style.opacity = "0";
            this.documentFrame.nativeElement.src = value;
        });
    }

    public onPreviewDocLoad() {
        if (this.downloadUrl === undefined) return;

        // if document loaded in less than 2s, set opacity to 100%

        setTimeout(() => {
            if (this.documentFrame.nativeElement.contentDocument !== null) {
                const body = this.documentFrame.nativeElement.contentDocument.body;
                body.style.cssText = `--factor: ${this.scalingFactor}; zoom: var(--factor)`;
            }
            this.documentFrame.nativeElement.style.opacity = "1";
        }, 1000);

        // do nothing when user has clicked on a document link
        if (this.documentFrame.nativeElement.contentDocument === null) return;

        // previewDocument must be created here when document is fully loaded
        // because in case of sheet, PreviewDocument constructor change.
        this.previewDocument = new PreviewDocument(this.documentFrame);

        // SVG highlight:
        //   background rectangle (highlight) were added to the SVG by the HTML generator (C#), but html generation is
        //   not able to know the geometry of the text. It is up to the browser to compute the position and size of the
        //   background. That needs to be done now that the iFrame is loaded.
        try {
            this.previewDocument.setSvgBackgroundPositionAndSize();
            /* To catch tab's sheet changes
            * Sheet structure:
            * <iframe #preview>
            *      #document
            *          ...
            *          <frameset>
            *              <iframe name="frSheet"> // current sheet displayed
            *              <iframe name="frTabs">  // contains all sheet's tabs
            *          </frameset>
            *          ...
            * </iframe>
            */
            const sheetFrame = this.documentFrame.nativeElement.contentDocument.getElementsByName("frSheet");
            if(sheetFrame.length > 0) {
                sheetFrame[0].removeEventListener("load", () => {});
                sheetFrame[0].addEventListener("load", () => {
                    this.previewDocument = new PreviewDocument(this.documentFrame);
                    this.pageChange.next(this.previewDocument);
                    this.cdr.markForCheck();
                }, true);
            }

            if (this.tooltip) {
                this.addTooltip(this.previewDocument);
            }

            if (this.minimap) {
                this.previewDocument.insertComponent(this.minimap.nativeElement);
            }

        } catch (error) {
            console.warn(error);
        }

        // Let upstream component know document is now ready
        this.onPreviewReady.next(this.previewDocument);
        this.cdr.markForCheck();
    }

    addTooltip(previewDocument: PreviewDocument) {
        previewDocument.insertComponent(this.tooltip.nativeElement);
    }

    ngOnInit() {
        this.documentFrame.nativeElement.addEventListener("load", this.previewDocLoadHandler, true);
    }

    ngOnDestroy() {
        this.documentFrame.nativeElement.removeEventListener("load", this.previewDocLoadHandler);
    }

    ngOnChanges(simpleChanges: SimpleChanges) {
        if (simpleChanges.scalingFactor) {
            const body = this.documentFrame.nativeElement.contentDocument.body;
            body.style.cssText = `--factor: ${this.scalingFactor};`;
        } else {
            // remove "virtually" the current IFrame's document
            this.documentFrame.nativeElement.style.opacity = "0";
        }
    }
}
