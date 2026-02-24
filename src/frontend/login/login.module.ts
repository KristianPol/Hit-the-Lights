import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { LoginComponent } from './login.component';

@NgModule({
  declarations: [

  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LoginComponent
  ],
  exports: [
    LoginComponent
  ]
})
export class LoginModule {
    // TODO Implement Login Module
}
