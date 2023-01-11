import {Component, AfterViewInit, ViewChild, ElementRef} from "@angular/core";
import {FormBuilder, FormGroup, FormControl} from "@angular/forms";
import { Observable } from 'rxjs';

import {QueryWebService, Record, Results} from "@sinequa/core/web-services";
import {LoginService} from "@sinequa/core/login";
import {AppService, Query} from "@sinequa/core/app-utils";
import {NotificationsService, Notification} from "@sinequa/core/notification";

import { DocumentCacheService } from "./preview/document-cache-parser";
import { BsFacetPreviewComponent2 } from "@sinequa/components/preview";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"]
})
export class AppComponent implements AfterViewInit {
    @ViewChild('iframe') iframe: ElementRef;
    @ViewChild('facet') facet: BsFacetPreviewComponent2;

    searchControl: FormControl;
    form: FormGroup;
    results$: Observable<Results> | undefined;

    constructor(
        protected formBuilder: FormBuilder,
        public loginService: LoginService,
        public appService: AppService,
        public queryWebService: QueryWebService,
        public documentCacheService: DocumentCacheService,
        public notificationsService: NotificationsService) {


        this.searchControl = new FormControl("");
        this.form = this.formBuilder.group({
            search: this.searchControl
        });

        // when preview document is fetched from cache, set iframe url with blobUrl related to
        // this.documentCacheService.blobUrl.subscribe(value => this.iframe.nativeElement.src = value);

        // to work with facet preview 2
        // this.documentCacheService.blobUrl.subscribe(value => this.facet.downloadUrl = value);

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

    openPreview(record: Record, mode?: 'default' | "fetch" | "transform") {
        this.documentCacheService.openPreview(record.id, mode);
    }
};