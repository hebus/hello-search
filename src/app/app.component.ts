import {Component, AfterViewInit, ViewChild, ElementRef} from "@angular/core";
import {FormBuilder, FormGroup, FormControl} from "@angular/forms";
import { Observable } from 'rxjs';

import {QueryWebService, Record, Results} from "@sinequa/core/web-services";
import {LoginService} from "@sinequa/core/login";
import {AppService, Query} from "@sinequa/core/app-utils";
import {NotificationsService, Notification} from "@sinequa/core/notification";

import { SearchService } from "@sinequa/components/search";
import { PreviewService } from "@sinequa/components/preview";

@Component({
    selector: "app",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"]
})
export class AppComponent implements AfterViewInit {
    @ViewChild('iframe') iframe: ElementRef;
    
    searchControl: FormControl;
    form: FormGroup;
    results$: Observable<Results> | undefined;

    constructor(
        protected formBuilder: FormBuilder,
        public loginService: LoginService,
        public appService: AppService,
        public queryWebService: QueryWebService,
        public searchService: SearchService,
        public previewService: PreviewService,
        public notificationsService: NotificationsService) {


        this.searchControl = new FormControl("");
        this.form = this.formBuilder.group({
            search: this.searchControl
        });
    }

    ngAfterViewInit() {
        this.login();
    }

    search() {
        const ccquery = this.appService.ccquery;
        const query = new Query(ccquery ? ccquery.name : "_unknown");
        query.text = this.searchControl.value || "";
        this.results$ = this.queryWebService.getResults(query);
    }

    clear() {
        this.results$ = undefined;
        this.searchControl.setValue("");
    }

    login() {
        this.loginService.login();
    }

    logout() {
        this.clear();
        this.loginService.logout();
    }

    deleteNotification(notification: Notification) {
        setTimeout(() => this.notificationsService.deleteNotification(notification), 5000);
        return true;
    }
    
    record: Record;
    openPreview(record: Record) {
        this.record = record;
        this.previewService.getPreviewData(record.id, this.searchService.query).subscribe(data => {
            const url = this.previewService.makeDownloadUrl(data.documentCachedContentUrl) || '';
            
            // this.iframe.nativeElement.src = url;
            // return;
                        
            // simple fetch
            // fetch(url).then(r => {
            //     r.blob().then(blob => {
            //         const blobUrl = URL.createObjectURL(blob);
            //         this.iframe.nativeElement.src = blobUrl;
            //     });
            // });
            
            // fetch and change images attribute
            fetch(url).then(r => {
                const contentType = r.headers.get("content-Type") || '';
                return r.text().then(text => {
                    const html = this.extract(text, url);
                    const blob = new Blob([html], { type: contentType });
                    const blobUrl = URL.createObjectURL(blob);
                    this.iframe.nativeElement.src = blobUrl;
                })
            })
        })
    }
    
    extract(buffer, url): string {
        const dom = new DOMParser();
        const doc = dom.parseFromString(buffer, "text/html");
        
        // add base href when not existing
        const links = doc.querySelectorAll("head > link");
        links.forEach(link => link.setAttribute("defer", ""));
        
        const baseHrefCounter = doc.querySelectorAll("head > base");
        if (baseHrefCounter.length === 0) {
            const base = /(^.*)(file.htm$)/gm.exec(url);
            if (base !== null) {
                const baseHref = doc.createElement("base");
                console.log("make url", { origin: this.appService.origin, url: base[0], base });
                baseHref.setAttribute("href", this.appService.origin + base[0]);
                // base href should be the first child
                doc.head.prepend(baseHref);

                console.log("Add: base href", baseHref);
            }
        }

        
        /**
         * object manipulations
         */
        const nodes = doc.querySelectorAll('object');
    
        nodes.forEach(node => {
            if (node.data) {
                // extract svg name from ['data'] attribute
                const regex = /^.*\/(.+svg$)/gm.exec(node.data);
                if (regex !== null) {                    
                    const name = regex[1];
                    const img = doc.createElement('img');
                    img.src = `file_files/${name}`;
                    img.setAttribute("loading", "lazy");
           
                    img.className = node.className;
                    img.style.cssText = node.style.cssText;
                    
                    // replace objet with <iframe>
                    node.parentNode?.replaceChild(img, node);
                }
            }
         })
         console.log("Replace <object> with <img>:", nodes.length);
        
        /**
         * images manipulations
         */
        const images = doc.querySelectorAll('img');
        images.forEach(image => {
            // image.src = "https://localhost:4200/assets/vanilla-logo.png";
            // image.srcset = "";
            image.setAttribute("loading", "lazy");
            image.setAttribute("data-sinequa", "Take the control!!");
        });
        console.log("Update images:", images.length);
        
        // return the document
        // I can't serialize it, because I need to keep scripts undamaged
        return doc.documentElement.innerHTML;
    }
};
